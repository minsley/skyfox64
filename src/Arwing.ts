import {
    Scene,
    Vector3,
    Color3,
    MeshBuilder,
    StandardMaterial,
    UniversalCamera,
    TransformNode
} from '@babylonjs/core';
import { SceneLoader } from '@babylonjs/core/Loading/sceneLoader';
import '@babylonjs/loaders/glTF/2.0/glTFLoader';

export interface ArwingControls {
    forward: boolean;
    backward: boolean;
    left: boolean;
    right: boolean;
    up: boolean;
    down: boolean;
    boost: boolean;
    brake: boolean;
    fire: boolean;
    barrelRollLeft: boolean;
    barrelRollRight: boolean;
}

interface LaserProjectile {
    mesh: any;
    velocity: Vector3;
    createdTime: number;
    lifetime: number;
}

export class Arwing {
    public mesh: TransformNode;
    public camera!: UniversalCamera;
    private scene: Scene;
    private velocity: Vector3 = Vector3.Zero();
    private angularVelocity: Vector3 = Vector3.Zero();
    private turnSpeed = 2;
    private isBarrelRolling = false;
    private barrelRollTime = 0;
    private barrelRollDirection = 0;
    private lastFireTime = 0;
    private fireRate = 100; // ms between shots
    private cameraOffset: Vector3 = new Vector3(0, 2, -10);
    private basePositionZ = -20; // Original Z position
    private targetPositionZ = -20; // Target Z position for smooth movement
    private positionLerpSpeed = 8; // How fast to lerp to target position
    private laserProjectiles: LaserProjectile[] = [];
    private health = 3; // Maximum health
    private maxHealth = 3;
    private collectedUrls: string[] = []; // Store URLs from collisions

    constructor(scene: Scene) {
        this.scene = scene;
        this.mesh = new TransformNode("arwing", scene);
        this.setupCamera();
        this.mesh.position = new Vector3(0, 0, this.basePositionZ);
        // Load model asynchronously
        this.loadArwingModel();
    }

    private async loadArwingModel() {
        try {
            const result = await SceneLoader.ImportMeshAsync(
                "",
                "/starfox64-arwing/",
                "scene.gltf",
                this.scene
            );

            // Parent all loaded meshes to our transform node
            result.meshes.forEach(mesh => {
                if (mesh.parent === null) {
                    mesh.parent = this.mesh;
                }
            });

            // Scale and orient the model if needed
            this.mesh.scaling = new Vector3(1,1,1); // Adjust scale as needed
            this.mesh.rotation.y = Math.PI; // Face forward
            
            console.log("Arwing GLTF model loaded successfully");

        } catch (error) {
            console.error("Failed to load Arwing GLTF model:", error);
            // Fallback to a simple primitive if GLTF loading fails
            this.createFallbackModel();
        }
    }

    private createFallbackModel() {
        console.log("Using fallback primitive model");
        const body = MeshBuilder.CreateBox("arwingBody", {
            width: 2,
            height: 0.5,
            depth: 6
        }, this.scene);
        body.parent = this.mesh;

        const bodyMaterial = new StandardMaterial("bodyMaterial", this.scene);
        bodyMaterial.diffuseColor = new Color3(0.7, 0.7, 0.8);
        body.material = bodyMaterial;
    }

    private setupCamera() {
        this.camera = new UniversalCamera("arwingCamera", this.cameraOffset.clone(), this.scene);
        // Don't parent to mesh - we'll manually position it
        this.camera.setTarget(new Vector3(0, 0, 10));
        this.camera.fov = 1.85;
        this.camera.maxZ = 50;
        this.camera.minZ = -50;
    }

    public update(deltaTime: number, controls: ArwingControls) {
        this.handleMovement(deltaTime, controls);
        this.handleBarrelRoll(deltaTime, controls);
        this.handleCombat(controls);
        this.updatePosition(deltaTime);
        this.updateCamera();
        this.updateLasers(deltaTime);
    }

    private handleMovement(_deltaTime: number, controls: ArwingControls) {
        // if (this.isBarrelRolling) return;

        // Handle boost/brake position changes for visual effect
        if (controls.boost) {
            this.targetPositionZ = this.basePositionZ - 3; // Move forward when boosting
        } else if (controls.brake) {
            this.targetPositionZ = this.basePositionZ + 1; // Move backward when braking
        } else {
            this.targetPositionZ = this.basePositionZ; // Return to original position
        }
        
        // Lateral input for banking
        let lateralInput = 0;
        if (controls.left) lateralInput -= 1;
        if (controls.right) lateralInput += 1;

        // Vertical input for pitching
        let verticalInput = 0;
        if (controls.up) verticalInput -= 1;
        if (controls.down) verticalInput += 1;

        // Add in-plane velocity
        this.velocity.x = -lateralInput * this.turnSpeed * 5;
        this.velocity.y = -verticalInput * this.turnSpeed * 5;
        if(this.isBarrelRolling) {
            this.velocity.x += this.barrelRollDirection * 5;
        }

        if(!this.isBarrelRolling) {
            // Banking when turning
            this.angularVelocity.z = -lateralInput * this.turnSpeed;
            this.angularVelocity.x = verticalInput * this.turnSpeed;
        }
    }

    private handleBarrelRoll(deltaTime: number, controls: ArwingControls) {
        if (this.isBarrelRolling) {
            this.barrelRollTime += deltaTime;
            const rollDuration = 0.7; // seconds
            
            if (this.barrelRollTime >= rollDuration) {
                // Complete barrel roll
                this.isBarrelRolling = false;
                this.barrelRollTime = 0;
                this.mesh.rotation.z = 0;
            } else {
                // Animate barrel roll
                const progress = this.barrelRollTime / rollDuration;
                const easing = this.easeOutBack(progress);
                this.mesh.rotation.z = this.barrelRollDirection * Math.PI * 2 * easing;
            }
        } else {
            // Check for barrel roll input
            if (controls.barrelRollLeft) {
                this.startBarrelRoll(1);
            } else if (controls.barrelRollRight) {
                this.startBarrelRoll(-1);
            }
        }
    }

    private easeOutBack(x: number): number {
        const c1 = 1.70158;
        const c3 = c1 + 1;

        return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
    }

    private startBarrelRoll(direction: number) {
        if (this.isBarrelRolling) return;
        
        this.isBarrelRolling = true;
        this.barrelRollTime = 0;
        this.barrelRollDirection = direction;
    }

    private handleCombat(controls: ArwingControls) {
        if (controls.fire && Date.now() - this.lastFireTime > this.fireRate) {
            this.fireLasers();
            this.lastFireTime = Date.now();
        }
    }

    private fireLasers() {
        // Create laser projectiles in front of the Arwing
        const leftLaserPos = this.mesh.position.add(new Vector3(-1.5, 0, -2));
        const rightLaserPos = this.mesh.position.add(new Vector3(1.5, 0, -2));

        this.createLaserProjectile(leftLaserPos);
        this.createLaserProjectile(rightLaserPos);
    }

    private createLaserProjectile(position: Vector3) {
        const laser = MeshBuilder.CreateSphere("laserProjectile", {
            diameter: 0.2
        }, this.scene);
        
        laser.position = position.clone();
        
        const laserMaterial = new StandardMaterial("laserProjectileMaterial", this.scene);
        laserMaterial.diffuseColor = new Color3(0, 1, 0);
        laserMaterial.emissiveColor = new Color3(0, 0.5, 0);
        laser.material = laserMaterial;

        // Create laser projectile object and add to array
        const laserProjectile: LaserProjectile = {
            mesh: laser,
            velocity: new Vector3(0, 0, -20), // Forward velocity
            createdTime: Date.now(),
            lifetime: 2000 // 2 seconds in milliseconds
        };
        
        this.laserProjectiles.push(laserProjectile);
    }

    private updateLasers(deltaTime: number) {
        const currentTime = Date.now();
        
        // Update and clean up laser projectiles
        for (let i = this.laserProjectiles.length - 1; i >= 0; i--) {
            const laser = this.laserProjectiles[i];
            
            // Check if laser has expired
            if (currentTime - laser.createdTime > laser.lifetime) {
                laser.mesh.dispose();
                this.laserProjectiles.splice(i, 1);
                continue;
            }
            
            // Move laser forward
            laser.mesh.position.addInPlace(laser.velocity.scale(deltaTime));
        }
    }

    private updatePosition(deltaTime: number) {
        if (!this.isBarrelRolling) {
            // Apply angular velocity for banking
            this.mesh.rotation.z += this.angularVelocity.z * deltaTime;
            this.mesh.rotation.x += this.angularVelocity.x * deltaTime;

            // Damping
            this.angularVelocity.scaleInPlace(0.9);
            
            // Gradually return to level flight
            this.mesh.rotation.z *= 0.95;
            this.mesh.rotation.x *= 0.95;
        }

        // Smoothly lerp Z position for boost/brake visual effect
        const currentZ = this.mesh.position.z;
        const newZ = currentZ + (this.targetPositionZ - currentZ) * this.positionLerpSpeed * deltaTime;
        this.mesh.position.z = newZ;

        // Apply velocity
        this.mesh.position.addInPlace(this.velocity.scale(deltaTime));
    }

    private updateCamera() {
        // Position camera relative to Arwing position but without rotation
        this.camera.position.set(
            this.cameraOffset.x + this.mesh.position.x,
            this.cameraOffset.y + this.mesh.position.y,
            this.cameraOffset.z);

        // Keep camera looking forward (no rotation inheritance)
        this.camera.setTarget(this.mesh.position.add(new Vector3(0, 0, -10)));
    }

    public getSpeedMultiplier(controls: ArwingControls): number {
        // Return speed multiplier for messages based on Arwing controls
        let speed = 1.0; // Base speed
        
        if (controls.boost) speed = 2.0;  // Boost makes messages come faster
        if (controls.brake) speed = 0.3;  // Brake makes messages come slower
        
        return speed;
    }

    public checkCollisionWithMesh(mesh: any): boolean {
        // Use Babylon.js built-in collision detection with the Arwing's bounding box
        if (!this.mesh.getChildMeshes().length) {
            // No loaded model yet, use a simple distance check
            const distance = Vector3.Distance(this.mesh.position, mesh.position);
            return distance < 3; // Approximate collision distance
        }
        
        // Check collision with any of the Arwing's child meshes
        for (const childMesh of this.mesh.getChildMeshes()) {
            if (childMesh.intersectsMesh && childMesh.intersectsMesh(mesh, false)) {
                return true;
            }
        }
        
        return false;
    }

    public checkWallCollisions(wallColliders: any[]): boolean {
        // Check collision with invisible wall colliders
        for (const wall of wallColliders) {
            if (this.checkCollisionWithMesh(wall)) {
                // Calculate push direction away from wall
                const pushDirection = this.mesh.position.subtract(wall.position).normalize();
                const pushForce = pushDirection.scale(0.3); // Gentle push away from wall
                
                // Apply push force to prevent getting stuck in walls
                this.mesh.position.addInPlace(pushForce);
                
                return true; // Wall collision detected
            }
        }
        return false;
    }

    public triggerShake(intensity: number = 1.0) {
        // Add screen shake by applying random camera offset
        const shakeAmount = intensity * 0.5;
        const randomX = (Math.random() - 0.5) * shakeAmount;
        const randomY = (Math.random() - 0.5) * shakeAmount;
        
        // Apply shake to camera position temporarily
        this.camera.position.x += randomX;
        this.camera.position.y += randomY;
        
        // Reset shake after a short delay
        setTimeout(() => {
            this.camera.position.x -= randomX;
            this.camera.position.y -= randomY;
        }, 50);
    }

    public takeDamage(blueSkyUrl?: string): boolean {
        if (blueSkyUrl) {
            this.collectedUrls.push(blueSkyUrl);
        }
        
        this.health--;
        this.triggerShake(2.0); // Stronger shake for damage
        
        // Return true if Arwing is destroyed (health <= 0)
        return this.health <= 0;
    }

    public getHealth(): number {
        return this.health;
    }

    public getMaxHealth(): number {
        return this.maxHealth;
    }

    public getLastCollectedUrl(): string | undefined {
        return this.collectedUrls[this.collectedUrls.length - 1];
    }

    public resetHealth() {
        this.health = this.maxHealth;
        this.collectedUrls = [];
    }

    public dispose() {
        // Clean up laser projectiles
        this.laserProjectiles.forEach(laser => {
            laser.mesh.dispose();
        });
        this.laserProjectiles = [];
        
        this.mesh.dispose();
        this.camera.dispose();
    }
}