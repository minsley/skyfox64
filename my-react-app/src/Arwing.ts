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
    private basePositionZ = -20; // Original Z position
    private targetPositionZ = -20; // Target Z position for smooth movement
    private positionLerpSpeed = 8; // How fast to lerp to target position

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
        this.camera = new UniversalCamera("arwingCamera", new Vector3(0, 2, -10), this.scene);
        this.camera.parent = this.mesh;
        this.camera.setTarget(Vector3.Zero());
        // this.camera.rotation.y = Math.PI;
        // this.camera.rotation.x = 0.15;
        this.camera.fov = 1.85;
        // this.camera.position.z = 8;
        // this.camera.position.y = 1;
        this.camera.maxZ = 50;
        this.camera.minZ = -50;
    }

    public update(deltaTime: number, controls: ArwingControls) {
        this.handleMovement(deltaTime, controls);
        this.handleBarrelRoll(deltaTime, controls);
        this.handleCombat(controls);
        this.updatePosition(deltaTime);
    }

    private handleMovement(_deltaTime: number, controls: ArwingControls) {
        if (this.isBarrelRolling) return;

        // Handle boost/brake position changes for visual effect
        if (controls.boost) {
            this.targetPositionZ = this.basePositionZ + 3; // Move forward when boosting
        } else if (controls.brake) {
            this.targetPositionZ = this.basePositionZ - 2; // Move backward when braking
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
        this.velocity.x = -lateralInput * this.turnSpeed * 3;
        this.velocity.y = -verticalInput * this.turnSpeed * 3;

        // Banking when turning
        this.angularVelocity.z = -lateralInput * this.turnSpeed;
        this.angularVelocity.x = verticalInput * this.turnSpeed;
    }

    private handleBarrelRoll(deltaTime: number, controls: ArwingControls) {
        if (this.isBarrelRolling) {
            this.barrelRollTime += deltaTime;
            const rollDuration = 0.8; // seconds
            
            if (this.barrelRollTime >= rollDuration) {
                // Complete barrel roll
                this.isBarrelRolling = false;
                this.barrelRollTime = 0;
                this.mesh.rotation.z = 0;
            } else {
                // Animate barrel roll
                const progress = this.barrelRollTime / rollDuration;
                const easing = Math.sin(progress * Math.PI); // Smooth ease in/out
                this.mesh.rotation.z = this.barrelRollDirection * Math.PI * 2 * easing;
            }
        } else {
            // Check for barrel roll input
            if (controls.barrelRollLeft) {
                this.startBarrelRoll(-1);
            } else if (controls.barrelRollRight) {
                this.startBarrelRoll(1);
            }
        }
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
        // Create laser projectiles
        const leftLaserPos = this.mesh.position.add(new Vector3(-5, 0, -1));
        const rightLaserPos = this.mesh.position.add(new Vector3(5, 0, -1));

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

        // Animate laser forward
        const laserSpeed = 200;
        const laserLifetime = 2; // seconds
        
        let elapsedTime = 0;
        const laserAnimation = () => {
            elapsedTime += this.scene.getEngine().getDeltaTime() / 1000;
            
            if (elapsedTime >= laserLifetime) {
                laser.dispose();
                this.scene.unregisterBeforeRender(laserAnimation);
                return;
            }
            
            laser.position.z += laserSpeed * this.scene.getEngine().getDeltaTime() / 1000;
        };
        
        this.scene.registerBeforeRender(laserAnimation);
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

        console.log(this.mesh.position);
    }

    public getPosition(): Vector3 {
        return this.mesh.position.clone();
    }

    public getSpeedMultiplier(controls: ArwingControls): number {
        // Return speed multiplier for messages based on Arwing controls
        let speed = 1.0; // Base speed
        
        if (controls.boost) speed = 2.0;  // Boost makes messages come faster
        if (controls.brake) speed = 0.3;  // Brake makes messages come slower
        
        return speed;
    }

    public dispose() {
        this.mesh.dispose();
        this.camera.dispose();
    }
}