import {
    Scene,
    Vector3,
    Color3,
    MeshBuilder,
    StandardMaterial,
    UniversalCamera,
    TransformNode
} from '@babylonjs/core';

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
    private baseSpeed = 0.1;
    private boostSpeed = 50;
    private brakeSpeed = 10;
    private turnSpeed = 2;
    private isBarrelRolling = false;
    private barrelRollTime = 0;
    private barrelRollDirection = 0;
    private lastFireTime = 0;
    private fireRate = 100; // ms between shots

    constructor(scene: Scene) {
        this.scene = scene;
        this.mesh = new TransformNode("arwing", scene);
        this.createArwingModel();
        this.setupCamera();
        this.mesh.position = new Vector3(0, 0, -20);
    }

    private createArwingModel() {
        // Main body (elongated box)
        const body = MeshBuilder.CreateBox("arwingBody", {
            width: 2,
            height: 0.5,
            depth: 6
        }, this.scene);
        body.parent = this.mesh;

        const bodyMaterial = new StandardMaterial("bodyMaterial", this.scene);
        bodyMaterial.diffuseColor = new Color3(0.7, 0.7, 0.8);
        bodyMaterial.specularColor = new Color3(0.9, 0.9, 1);
        body.material = bodyMaterial;

        // Wings
        const leftWing = MeshBuilder.CreateBox("leftWing", {
            width: 4,
            height: 0.2,
            depth: 2
        }, this.scene);
        leftWing.position = new Vector3(-3, 0, -1);
        leftWing.parent = this.mesh;

        const rightWing = MeshBuilder.CreateBox("rightWing", {
            width: 4,
            height: 0.2,
            depth: 2
        }, this.scene);
        rightWing.position = new Vector3(3, 0, -1);
        rightWing.parent = this.mesh;

        const wingMaterial = new StandardMaterial("wingMaterial", this.scene);
        wingMaterial.diffuseColor = new Color3(0.2, 0.4, 0.8);
        leftWing.material = wingMaterial;
        rightWing.material = wingMaterial;

        // Wing tips/lasers
        const leftLaser = MeshBuilder.CreateSphere("leftLaser", {
            diameter: 0.4
        }, this.scene);
        leftLaser.position = new Vector3(-5, 0, -1);
        leftLaser.parent = this.mesh;

        const rightLaser = MeshBuilder.CreateSphere("rightLaser", {
            diameter: 0.4
        }, this.scene);
        rightLaser.position = new Vector3(5, 0, -1);
        rightLaser.parent = this.mesh;

        const laserMaterial = new StandardMaterial("laserMaterial", this.scene);
        laserMaterial.diffuseColor = new Color3(1, 0.2, 0.2);
        laserMaterial.emissiveColor = new Color3(0.5, 0.1, 0.1);
        leftLaser.material = laserMaterial;
        rightLaser.material = laserMaterial;

        // Cockpit
        const cockpit = MeshBuilder.CreateSphere("cockpit", {
            diameter: 1
        }, this.scene);
        cockpit.position = new Vector3(0, 0.3, 1);
        cockpit.parent = this.mesh;

        const cockpitMaterial = new StandardMaterial("cockpitMaterial", this.scene);
        cockpitMaterial.diffuseColor = new Color3(0.1, 0.1, 0.3);
        cockpitMaterial.alpha = 0.7;
        cockpit.material = cockpitMaterial;

        // Engines
        const leftEngine = MeshBuilder.CreateCylinder("leftEngine", {
            height: 1.5,
            diameter: 0.6
        }, this.scene);
        leftEngine.position = new Vector3(-1.5, -0.2, -2.5);
        leftEngine.rotation.x = Math.PI / 2;
        leftEngine.parent = this.mesh;

        const rightEngine = MeshBuilder.CreateCylinder("rightEngine", {
            height: 1.5,
            diameter: 0.6
        }, this.scene);
        rightEngine.position = new Vector3(1.5, -0.2, -2.5);
        rightEngine.rotation.x = Math.PI / 2;
        rightEngine.parent = this.mesh;

        const engineMaterial = new StandardMaterial("engineMaterial", this.scene);
        engineMaterial.diffuseColor = new Color3(0.5, 0.5, 0.5);
        leftEngine.material = engineMaterial;
        rightEngine.material = engineMaterial;
    }

    private setupCamera() {
        this.camera = new UniversalCamera("arwingCamera", new Vector3(0, 2, 10), this.scene);
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

        let currentSpeed = this.baseSpeed;
        if (controls.boost) currentSpeed = this.boostSpeed;
        if (controls.brake) currentSpeed = this.brakeSpeed;

        // Constant forward movement
        this.velocity.z = currentSpeed;

        // Lateral movement
        let lateralInput = 0;
        if (controls.left) lateralInput += 1;
        if (controls.right) lateralInput -= 1;

        // Vertical movement
        let verticalInput = 0;
        if (controls.up) verticalInput -= 1;
        if (controls.down) verticalInput += 1;

        // Apply movement with banking
        this.velocity.x = lateralInput * currentSpeed * 0.5;
        this.velocity.y = verticalInput * currentSpeed * 0.5;

        // Banking when turning
        this.angularVelocity.z = -lateralInput * this.turnSpeed;
        this.angularVelocity.x = verticalInput * this.turnSpeed * 0.5;
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

        // Apply velocity
        this.mesh.position.addInPlace(this.velocity.scale(deltaTime));
    }

    public getPosition(): Vector3 {
        return this.mesh.position.clone();
    }

    public dispose() {
        this.mesh.dispose();
        this.camera.dispose();
    }
}