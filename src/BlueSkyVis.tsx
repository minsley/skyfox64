import React, { useEffect, useRef, useState } from 'react';
import {
    Engine,
    Scene,
    Vector3,
    Color3,
    Color4,
    UniversalCamera,
    StandardMaterial,
    MeshBuilder,
    Material,
    HemisphericLight,
    DirectionalLight
} from '@babylonjs/core';
import { TexturePool } from './TexturePool';
import { MessageObject, TextureUpdateResult, Settings } from './types';
import { Arwing } from './Arwing';
import { ArwingControlHandler } from './ArwingControls';

const fontSize = 32;
const lineHeight = fontSize * 1.1;

class TextWrapper {
    private canvas: HTMLCanvasElement;
    private context: CanvasRenderingContext2D;

    constructor() {
        this.canvas = document.createElement('canvas');
        this.context = this.canvas.getContext('2d')!;
        this.context.font = `bold ${fontSize}px sans-serif`;
    }

    wrapText(text: string, maxWidth: number): string[] {
        const words = text.split(' ');
        const lines: string[] = [];
        let currentLine = words[0];

        for (let i = 1; i < words.length; i++) {
            const word = words[i];
            const width = this.context.measureText(currentLine + " " + word).width;
            if (width < maxWidth) {
                currentLine += " " + word;
            } else {
                lines.push(currentLine);
                currentLine = word;
            }
        }
        lines.push(currentLine);
        return lines;
    }
}

interface BlueSkyVizProps {
    websocketUrl?: string;
    discardFraction?: number;
}

interface ExplosionParticle {
    mesh: any;
    velocity: Vector3;
    createdTime: number;
    lifetime: number;
}

interface GrowingMessage {
    messageObj: MessageObject;
    startTime: number;
    duration: number;
    initialScale: Vector3;
    targetScale: Vector3;
}

interface ExplodingPiece {
    mesh: any;
    velocity: Vector3;
    angularVelocity: Vector3;
    startTime: number;
    lifetime: number;
}

// Add styles to head
const styleSheet = document.createElement('style');
styleSheet.textContent = `
    .control-button {
        transition: opacity 0.3s ease-in-out;
        cursor: pointer;
        background-color: rgba(0, 0, 0, 0.5);
        border-radius: 50%;
        padding: 8px;
    }
    .control-button:hover {
        opacity: 1 !important;
    }
    @keyframes flash {
        0% { opacity: 0.3; }
        100% { opacity: 0.7; }
    }
`;
document.head.appendChild(styleSheet);

const BlueSkyViz: React.FC<BlueSkyVizProps> = ({ 
    websocketUrl = `ws${window.location.protocol === 'https:' ? 's' : ''}://${window.location.host}`,
    discardFraction = new URLSearchParams(window.location.search).get('discardFrac') ? 
        parseFloat(new URLSearchParams(window.location.search).get('discardFrac')!) : 
        (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ? 0.5 : 0)
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const engineRef = useRef<Engine | null>(null);
    const sceneRef = useRef<Scene | null>(null);
    const cameraRef = useRef<UniversalCamera | null>(null);
    const texturePoolRef = useRef<TexturePool | null>(null);
    const messageObjectsRef = useRef<MessageObject[]>([]);
    const lastFrameTimeRef = useRef<number>(Date.now());
    const cameraRotationRef = useRef<number>(0);
    const camDirRef = useRef<number>(1);
    const textWrapperRef = useRef<TextWrapper | null>(null);
    const animationFrameRef = useRef<number>();
    const connectingMessageRef = useRef<MessageObject | null>(null);
    const arwingRef = useRef<Arwing | null>(null);
    const controlsRef = useRef<ArwingControlHandler | null>(null);
    const [arwingMode] = useState<boolean>(true);
    const wallCollidersRef = useRef<any[]>([]);
    const explosionParticlesRef = useRef<ExplosionParticle[]>([]);
    const growingMessagesRef = useRef<GrowingMessage[]>([]);
    const explodingPiecesRef = useRef<ExplodingPiece[]>([]);
    const hitAudioRef = useRef<HTMLAudioElement | null>(null);
    const objectExplodeAudioRef = useRef<HTMLAudioElement | null>(null);
    const shipExplodeAudioRef = useRef<HTMLAudioElement | null>(null);
    const laserAudioRef = useRef<HTMLAudioElement | null>(null);
    const boostAudioRef = useRef<HTMLAudioElement | null>(null);
    const brakeAudioRef = useRef<HTMLAudioElement | null>(null);
    const bgMusicAudioRef = useRef<HTMLAudioElement | null>(null);

    const tunnelLength = 40;

    const createWallColliders = (scene: Scene) => {
        // Create invisible wall colliders for the tunnel boundaries
        const wallThickness = 1;
        const tunnelWidth = 15; // Total tunnel width (7.4 * 2 + some margin)
        const tunnelHeight = 15; // Total tunnel height (7.4 * 2 + some margin)
        const colliderLength = tunnelLength * 2; // Make colliders longer than tunnel
        
        // Right wall collider (wall 0)
        const rightWall = MeshBuilder.CreateBox("rightWallCollider", {
            width: wallThickness,
            height: tunnelHeight,
            depth: colliderLength
        }, scene);
        rightWall.position.set(8.5, 0, -colliderLength/2); // Position outside right wall
        rightWall.isVisible = false; // Make invisible
        
        // Left wall collider (wall 1)
        const leftWall = MeshBuilder.CreateBox("leftWallCollider", {
            width: wallThickness,
            height: tunnelHeight,
            depth: colliderLength
        }, scene);
        leftWall.position.set(-8.5, 0, -colliderLength/2); // Position outside left wall
        leftWall.isVisible = false;
        
        // Top wall collider (wall 2)
        const topWall = MeshBuilder.CreateBox("topWallCollider", {
            width: tunnelWidth,
            height: wallThickness,
            depth: colliderLength
        }, scene);
        topWall.position.set(0, 8.5, -colliderLength/2); // Position above top wall
        topWall.isVisible = false;
        
        // Bottom wall collider (wall 3)
        const bottomWall = MeshBuilder.CreateBox("bottomWallCollider", {
            width: tunnelWidth,
            height: wallThickness,
            depth: colliderLength
        }, scene);
        bottomWall.position.set(0, -8.5, -colliderLength/2); // Position below bottom wall
        bottomWall.isVisible = false;
        
        wallCollidersRef.current = [rightWall, leftWall, topWall, bottomWall];
    };

    const setupScene = (scene: Scene) => {
        scene.clearColor = new Color4(0, 0, 0, 1);
        scene.fogMode = Scene.FOGMODE_LINEAR;
        scene.fogColor = new Color3(0, 0, 0);
        scene.fogStart = 35;
        scene.fogEnd = 40;

        // Add lighting for Arwing visibility
        const ambientLight = new HemisphericLight("ambientLight", new Vector3(0, 1, 0), scene);
        ambientLight.intensity = 0.7;
        ambientLight.diffuse = new Color3(0.8, 0.8, 1);

        const sunLight = new DirectionalLight("sunLight", new Vector3(-1, -1, 1), scene);
        sunLight.intensity = 0.8;
        sunLight.diffuse = new Color3(1, 0.9, 0.7);

        scene.setRenderingOrder(0, null, null, (a, b) => {
            const meshA = a.getMesh();
            const meshB = b.getMesh();
            if (meshA && meshB) {
                return (meshA as any).renderOrder - (meshB as any).renderOrder;
            }
            return 0;
        });
    };

    const setupCamera = (scene: Scene) => {
        if (arwingMode && arwingRef.current) {
            return arwingRef.current.camera;
        }
        
        const camera = new UniversalCamera("camera", new Vector3(0, 0, 0), scene);
        camera.rotation.y = Math.PI;
        camera.rotation.x = 0.15;
        camera.fov = 1.85;
        camera.position.z = 8;
        camera.position.y = 1;
        camera.maxZ = 50;
        return camera;
    };

    const updateTextTexture = (textureObj: any, lines: string[], specialColor: boolean, useBoldFont: boolean = true): TextureUpdateResult => {
        const texture = textureObj.texture;
        const context = texture.getContext();
        context.clearRect(0, 0, texture.getSize().width, texture.getSize().height);
        
        context.font = `${useBoldFont ? 'bold ' : ''}${fontSize}px sans-serif`;
        context.textAlign = 'center';
        context.textBaseline = 'middle';

        const totalHeight = lines.length * lineHeight;
        const startY = (texture.getSize().height - totalHeight) / 2;

        let r = Math.floor(Math.random() * 200 + 55);
        let g = Math.floor(Math.random() * 200 + 55);
        let b = Math.floor(Math.random() * 200 + 55);

        if (specialColor) {
            r = Math.floor(Math.random() * 100 + 155);
            g = Math.floor(Math.random() * 100 + 155);
            b = Math.floor(Math.random() * 100 + 155);
        }

        lines.forEach((line, index) => {
            const y = startY + (index * lineHeight) + lineHeight/2;
            
            context.shadowColor = 'rgba(0, 0, 0, 0.8)';
            context.shadowBlur = 15;
            context.shadowOffsetX = 0;
            context.shadowOffsetY = 0;
            
            context.strokeStyle = 'rgba(0, 0, 0, 0.9)';
            context.lineWidth = 6;
            context.strokeText(line, texture.getSize().width/2, y);

            context.fillStyle = `rgba(${r}, ${g}, ${b}, 0.9)`;
            context.fillText(line, texture.getSize().width/2, y);
        });
        
        texture.update(true);
        return { textureObj, lineCount: lines.length };
    };

    const getCoordsNotInCenter = (): { x: number, y: number } => {
        const centerExtent = 10;
        const centerExtentX = 7;
        const x = (Math.random()) * centerExtentX - centerExtentX/2;
        const y = (Math.random()) * centerExtent - centerExtent/2;
        
        if (Math.sqrt(x*x + y*y) < 2) {
            return getCoordsNotInCenter();
        }
        return { x, y };
    };

    const positionOnWall = (plane: any, wall: number): void => {
        const randomOffset = () => Math.random() * 2 - 1;
        
        switch(wall) {
            case 0:
                plane.position.x = 7.4 + randomOffset();
                plane.position.y = Math.random() * 12 - 6;
                plane.rotation.y = Math.PI/2;
                break;
            case 1:
                plane.position.x = -7.4 + randomOffset();
                plane.position.y = Math.random() * 12 - 6;
                plane.rotation.y = -Math.PI/2;
                break;
            case 2:
                plane.position.x = Math.random() * 12 - 6;
                plane.position.y = 7.4 + randomOffset();
                plane.rotation.x = -Math.PI/2;
                plane.rotation.y = Math.PI;
                break;
            case 3:
                plane.position.x = Math.random() * 12 - 6;
                plane.position.y = -7.4 + randomOffset();
                plane.rotation.x = Math.PI/2;
                plane.rotation.y = Math.PI;
                break;
        }
    };

    const createMessage = (text: string, postData?: any) => {
        if (!sceneRef.current || !texturePoolRef.current || !textWrapperRef.current) return;
       
        let wall = Math.floor(Math.random() * (4 + 1* settingsRef.current.specialFrequency));
        
        // Discard messages based on discardFraction, regardless of wall type
        if (wall > 3) {
            wall = -1;
        }
        
        if (wall!==-1 && settingsRef.current.discardFraction > 0 && Math.random() < settingsRef.current.discardFraction) {
          
            return;
        }
     

        

        let lines = textWrapperRef.current.wrapText(text, 650);
        if (lines.length > 10) {
            lines = lines.slice(0, 10);
        }
        
        const textureObj = texturePoolRef.current.acquire(lines.length);
        const { lineCount } = updateTextTexture(textureObj, lines, wall === -1);
        
        const height = lineCount * 0.75;
        const plane = MeshBuilder.CreatePlane("message", {
            width: 7,
            height
        }, sceneRef.current);

        const material = new StandardMaterial("messageMat", sceneRef.current);
        
        material.diffuseTexture = textureObj.texture;
        material.specularColor = new Color3(0, 0, 0);
        material.emissiveColor = new Color3(1, 1, 1);
        material.backFaceCulling = false;
        material.diffuseTexture.hasAlpha = true;
        material.useAlphaFromDiffuseTexture = true;
        material.transparencyMode = Material.MATERIAL_ALPHABLEND;
        material.separateCullingPass = true;
        
        plane.material = material;
        plane.position.z = -tunnelLength;

        (plane as any).renderOrder = 0; // Using type assertion for custom property

        if (wall === -1) {
            const { x, y } = getCoordsNotInCenter();
            plane.position.x = x;
            plane.position.y = y;
            plane.rotation.y = Math.PI;
        } else {
            positionOnWall(plane, wall);
        }

        const arbitraryOrder = Math.round(Math.random() * 1000);
        (plane as any).renderOrder = wall === -1 ? arbitraryOrder + 10000 : arbitraryOrder;

        // Generate Bluesky URL if we have post data
        let blueSkyUrl: string | undefined;
        if (postData && postData.commit?.record?.text && wall === -1) {
            // Extract DID and rkey from the post data to construct URL
            const did = postData.did;
            const rkey = postData.commit?.rkey;
            if (did && rkey) {
                blueSkyUrl = `https://bsky.app/profile/${did}/post/${rkey}`;
            }
        }

        messageObjectsRef.current.push({
            mesh: plane,
            textureObj,
            speed: wall === -1 ? 0.005 + 0.5 * (0.08 + Math.random() * 0.12) : 0.05 + Math.random() * 0.005,
            special: wall === -1,
            arbitraryOrder,
            blueSkyUrl
        });
    };

    const createExplosion = (position: Vector3) => {
        if (!sceneRef.current) return;

        // Create multiple explosion particles
        const particleCount = 8;
        for (let i = 0; i < particleCount; i++) {
            const particle = MeshBuilder.CreateSphere("explosionParticle", {
                diameter: 0.3
            }, sceneRef.current);
            
            particle.position = position.clone();
            
            const particleMaterial = new StandardMaterial("explosionParticleMaterial", sceneRef.current);
            particleMaterial.diffuseColor = new Color3(1, 0.5, 0); // Orange explosion color
            particleMaterial.emissiveColor = new Color3(1, 0.2, 0);
            particle.material = particleMaterial;

            // Random velocity for each particle
            const velocity = new Vector3(
                (Math.random() - 0.5) * 10,
                (Math.random() - 0.5) * 10,
                (Math.random() - 0.5) * 10
            );

            const explosionParticle: ExplosionParticle = {
                mesh: particle,
                velocity,
                createdTime: Date.now(),
                lifetime: 1000 // 1 second lifetime
            };
            
            explosionParticlesRef.current.push(explosionParticle);
        }
    };

    const createArwingExplosion = (position: Vector3) => {
        if (!sceneRef.current || !arwingRef.current) return;

        // Get all child meshes from the Arwing
        const childMeshes = arwingRef.current.mesh.getChildMeshes();
        
        // Create exploding pieces from each child mesh
        childMeshes.forEach(childMesh => {
            try {
                // Clone the mesh for the explosion effect
                const explodingMesh = childMesh.clone(`exploding_${childMesh.name}`, null);
                if (explodingMesh) {
                    // Position at the Arwing's current location
                    explodingMesh.position = position.clone().add(childMesh.position);
                    explodingMesh.rotation = childMesh.rotation.clone();
                    explodingMesh.scaling = childMesh.scaling.clone();
                    
                    // Create random velocity for spinning off
                    const velocity = new Vector3(
                        (Math.random() - 0.5) * 20, // Random X velocity
                        (Math.random() - 0.5) * 20, // Random Y velocity  
                        (Math.random() - 0.5) * 10 + 15 // Forward and random Z velocity
                    );
                    
                    // Create random angular velocity for spinning
                    const angularVelocity = new Vector3(
                        (Math.random() - 0.5) * 8, // Random X rotation
                        (Math.random() - 0.5) * 8, // Random Y rotation
                        (Math.random() - 0.5) * 8  // Random Z rotation
                    );
                    
                    const explodingPiece: ExplodingPiece = {
                        mesh: explodingMesh,
                        velocity,
                        angularVelocity,
                        startTime: Date.now(),
                        lifetime: 2000 // 2 seconds
                    };
                    
                    explodingPiecesRef.current.push(explodingPiece);
                }
            } catch (error) {
                console.warn('Could not create exploding piece from mesh:', childMesh.name, error);
            }
        });
        
        // Hide the original Arwing
        arwingRef.current.mesh.setEnabled(false);
    };

    const createArwingDestruction = (position: Vector3) => {
        if (!sceneRef.current) return;

        // Create many more particles for dramatic effect
        const particleCount = 50;
        for (let i = 0; i < particleCount; i++) {
            const particle = MeshBuilder.CreateSphere("destructionParticle", {
                diameter: Math.random() * 0.8 + 0.2 // Varied sizes
            }, sceneRef.current);
            
            particle.position = position.clone();
            
            const particleMaterial = new StandardMaterial("destructionParticleMaterial", sceneRef.current);
            // Mix of colors for more dramatic effect
            const colorVariation = Math.random();
            if (colorVariation < 0.4) {
                particleMaterial.diffuseColor = new Color3(1, 0.2, 0); // Red
                particleMaterial.emissiveColor = new Color3(1, 0.1, 0);
            } else if (colorVariation < 0.7) {
                particleMaterial.diffuseColor = new Color3(1, 0.6, 0); // Orange
                particleMaterial.emissiveColor = new Color3(1, 0.3, 0);
            } else {
                particleMaterial.diffuseColor = new Color3(1, 1, 0.2); // Yellow
                particleMaterial.emissiveColor = new Color3(1, 1, 0.1);
            }
            particle.material = particleMaterial;

            // Much higher velocities to fill the screen
            const velocity = new Vector3(
                (Math.random() - 0.5) * 30,
                (Math.random() - 0.5) * 30,
                (Math.random() - 0.5) * 30
            );

            const explosionParticle: ExplosionParticle = {
                mesh: particle,
                velocity,
                createdTime: Date.now(),
                lifetime: 1500 // 1.5 second lifetime
            };
            
            explosionParticlesRef.current.push(explosionParticle);
        }
    };

    const playSound = (audioRef: React.MutableRefObject<HTMLAudioElement | null>) => {
        // Only play sounds if user has interacted with the page
        if (audioRef.current) {
            try {
                audioRef.current.currentTime = 0; // Reset to beginning
                audioRef.current.play().catch(e => {
                    console.warn('Could not play sound:', e);
                });
            } catch (error) {
                console.warn('Error playing sound:', error);
            }
        } else {
            console.log('Sound not played - audioRef.current:', !!audioRef.current);
        }
    };

    const playHitSound = () => {
        playSound(hitAudioRef);
    };

    const playObjectExplodeSound = () => {
        playSound(objectExplodeAudioRef);
    };

    const playLaserSound = () => {
        playSound(laserAudioRef);
    };

    const playShipExplodeSound = () => {
        playSound(shipExplodeAudioRef);
    };

    const playBoostSound = () => {
        playSound(boostAudioRef);
    };

    const playBrakeSound = () => {
        playSound(brakeAudioRef);
    };

    const playBackgroundMusic = () => {
        if (bgMusicAudioRef.current && !musicStarted) {
            bgMusicAudioRef.current.play().then(() => {
                setMusicStarted(true);
                console.log('Background music started');
            }).catch(e => {
                // Only log non-autoplay related errors
                if (!e.message || (!e.message.includes('user agent') && !e.message.includes('autoplay'))) {
                    console.warn('Could not start background music:', e);
                }
            });
        }
    };

    const pauseBackgroundMusic = () => {
        if (bgMusicAudioRef.current && !bgMusicAudioRef.current.paused) {
            bgMusicAudioRef.current.pause();
        }
    };

    const resumeBackgroundMusic = () => {
        if (bgMusicAudioRef.current && bgMusicAudioRef.current.paused && musicStarted) {
            bgMusicAudioRef.current.play().catch(e => {
                console.warn('Could not resume background music:', e);
            });
        }
    };

    const updateScene = () => {
        if (!sceneRef.current || !engineRef.current || !cameraRef.current) return;

        const currentTime = Date.now();
        const deltaTime = (currentTime - lastFrameTimeRef.current) / 1000;
        lastFrameTimeRef.current = currentTime;

        // Update Arwing if in Arwing mode
        let arwingSpeedMultiplier = 1.0;
        if (arwingMode && arwingRef.current && controlsRef.current) {
            const controls = controlsRef.current.getControls();
            arwingRef.current.update(deltaTime, controls);
            arwingSpeedMultiplier = arwingRef.current.getSpeedMultiplier(controls);
            
            // Check wall collisions
            if (arwingRef.current.checkWallCollisions(wallCollidersRef.current)) {
                // Trigger stronger screen shake for wall collision
                arwingRef.current.triggerShake(2.0);
                // Play hit sound effect
                playHitSound();
            }
        }
        
        // Calculate audio multiplier
        let audioMultiplier = 1.0;
        if (settingsRef.current.audioEnabled && analyserRef.current && audioDataRef.current) {
            analyserRef.current.getByteFrequencyData(audioDataRef.current);
            // Get average of frequencies
            const sum = audioDataRef.current.reduce((a, b) => a + b, 0);
            const avg = sum / audioDataRef.current.length;
            // Map 0-255 to 0.1-3.0 for audio multiplier
            audioMultiplier = 0.1 + (avg / 255) * 2.9;
        }

        // Update camera (only in static camera mode)
        if (!arwingMode) {
            cameraRotationRef.current += deltaTime * 0.015 * camDirRef.current;
            if (cameraRotationRef.current > 0.13 * Math.PI/2) {
                camDirRef.current = -1;
            } else if (cameraRotationRef.current < 0.13 * -Math.PI/2) {
                camDirRef.current = 1;
            }
            cameraRef.current.rotation.z = cameraRotationRef.current;
        }

        // Update messages
        for (let i = messageObjectsRef.current.length - 1; i >= 0; i--) {
            const message = messageObjectsRef.current[i];
            message.mesh.position.z += 100 * message.speed * settingsRef.current.baseSpeed * audioMultiplier * arwingSpeedMultiplier * deltaTime;
            (message.mesh as any).renderOrder = message.arbitraryOrder;

            if (message.special) {
                (message.mesh as any).renderOrder = message.mesh.position.z + 10000;
            }

            // Check collision with laser projectiles (only for special messages)
            if (arwingMode && arwingRef.current && message.special) {
                const laserProjectiles = arwingRef.current.getLaserProjectiles();
                let messageDestroyed = false;

                for (let j = laserProjectiles.length - 1; j >= 0; j--) {
                    const laser = laserProjectiles[j];
                    const distance = Vector3.Distance(laser.mesh.position, message.mesh.position);
                    
                    if (distance < 2) { // Collision detected
                        // Create explosion effect
                        createExplosion(message.mesh.position);

                        // play sound effect
                        playObjectExplodeSound();
                        
                        // Remove laser and message
                        arwingRef.current.removeLaserProjectile(j);
                        message.mesh.dispose();
                        texturePoolRef.current?.release(message.textureObj);
                        messageObjectsRef.current.splice(i, 1);
                        messageDestroyed = true;
                        break;
                    }
                }

                if (messageDestroyed) continue;
            }

            // Check collision with Arwing if in Arwing mode (only for floating messages)
            if (arwingMode && arwingRef.current && message.special && !isArwingDestroyed) {
                if (arwingRef.current.checkCollisionWithMesh(message.mesh)) {
                    // Create explosion effect
                    createExplosion(message.mesh.position);
                    
                    // Play hit sound effect
                    playHitSound();
                    
                    // Take damage and store URL
                    const isDestroyed = arwingRef.current.takeDamage(message.blueSkyUrl);
                    
                    // Update health display
                    setArwingHealth(arwingRef.current.getHealth());
                    
                    // If Arwing is destroyed (health <= 0), start destruction animation
                    if (isDestroyed) {
                        playShipExplodeSound()
                        const lastUrl = arwingRef.current.getLastCollectedUrl();
                        console.log('Arwing destroyed! URL:', lastUrl); // Debug log
                        if (lastUrl) {
                            // Trigger destruction animation
                            const startTime = Date.now();
                            console.log('Starting destruction animation at:', startTime); // Debug log
                            setIsArwingDestroyed(true);
                            setDestructionStartTime(startTime);
                            setPendingBlueskyUrl(lastUrl);
                            createArwingDestruction(arwingRef.current.mesh.position);
                            createArwingExplosion(arwingRef.current.mesh.position);
                        }
                        
                        // Instead of disposing the message, start growing animation
                        const growingMessage: GrowingMessage = {
                            messageObj: message,
                            startTime: Date.now(),
                            duration: 1000, // 1 second
                            initialScale: message.mesh.scaling.clone(),
                            targetScale: message.mesh.scaling.clone().scale(8) // 8x larger
                        };
                        growingMessagesRef.current.push(growingMessage);
                        
                        // Remove from normal message array but don't dispose
                        messageObjectsRef.current.splice(i, 1);
                        continue; // Skip the rest of the loop for this message
                    } else {
                        // Normal collision - dispose the message
                        message.mesh.dispose();
                        texturePoolRef.current?.release(message.textureObj);
                        messageObjectsRef.current.splice(i, 1);
                        continue; // Skip the rest of the loop for this message
                    }
                }
            }

            if (message.mesh.position.z > 10) {
                message.mesh.dispose();
                texturePoolRef.current?.release(message.textureObj);
                messageObjectsRef.current.splice(i, 1);
            }
        }

        // Update explosion particles
        for (let i = explosionParticlesRef.current.length - 1; i >= 0; i--) {
            const particle = explosionParticlesRef.current[i];
            const elapsed = currentTime - particle.createdTime;
            
            if (elapsed > particle.lifetime) {
                particle.mesh.dispose();
                explosionParticlesRef.current.splice(i, 1);
                continue;
            }
            
            // Move particle and fade out over time
            particle.mesh.position.addInPlace(particle.velocity.scale(deltaTime));
            const fadeProgress = elapsed / particle.lifetime;
            const material = particle.mesh.material as StandardMaterial;
            material.alpha = 1 - fadeProgress;
            
            // Shrink particle over time
            const scale = 1 - fadeProgress * 0.5;
            particle.mesh.scaling.setAll(scale);
        }

        // Update exploding pieces
        for (let i = explodingPiecesRef.current.length - 1; i >= 0; i--) {
            const piece = explodingPiecesRef.current[i];
            const elapsed = currentTime - piece.startTime;
            
            if (elapsed > piece.lifetime) {
                piece.mesh.dispose();
                explodingPiecesRef.current.splice(i, 1);
                continue;
            }
            
            // Move piece with velocity
            piece.mesh.position.addInPlace(piece.velocity.scale(deltaTime));
            
            // Rotate piece with angular velocity  
            piece.mesh.rotation.addInPlace(piece.angularVelocity.scale(deltaTime));
            
            // Apply gravity and drag
            piece.velocity.y -= 15 * deltaTime; // Gravity
            piece.velocity.scaleInPlace(0.98); // Air resistance
            
            // Fade out over time
            const fadeProgress = elapsed / piece.lifetime;
            if (piece.mesh.material && piece.mesh.material.alpha !== undefined) {
                piece.mesh.material.alpha = 1 - fadeProgress;
            }
        }

        // Update growing messages
        for (let i = growingMessagesRef.current.length - 1; i >= 0; i--) {
            const growingMessage = growingMessagesRef.current[i];
            const elapsed = currentTime - growingMessage.startTime;
            
            if (elapsed > growingMessage.duration) {
                // Growing animation complete - dispose the message
                growingMessage.messageObj.mesh.dispose();
                if (texturePoolRef.current) {
                    texturePoolRef.current.release(growingMessage.messageObj.textureObj);
                }
                growingMessagesRef.current.splice(i, 1);
                continue;
            }
            
            // Interpolate scale from initial to target
            const progress = elapsed / growingMessage.duration;
            const easeProgress = 1 - Math.pow(1 - progress, 3); // Ease out cubic
            const currentScale = Vector3.Lerp(growingMessage.initialScale, growingMessage.targetScale, easeProgress);
            growingMessage.messageObj.mesh.scaling = currentScale;
        }

        // Handle connecting message fade out
        if (connectingMessageRef.current) {
            const elapsed = (Date.now() - (connectingMessageRef.current.createdAt || Date.now())) / 1000;
            if (elapsed > 2) { // Start fading after 2 seconds
                const fadeProgress = Math.min((elapsed - 2) / 1, 1); // Fade over 1 second
                const material = connectingMessageRef.current.mesh.material as StandardMaterial;
                material.alpha = 1 - fadeProgress;
                
                if (fadeProgress === 1) {
                    connectingMessageRef.current.mesh.dispose();
                    texturePoolRef.current?.release(connectingMessageRef.current.textureObj);
                    connectingMessageRef.current = null;
                }
            }
        }

        // Handle Arwing destruction animation timing (but don't reset here)
        if (isArwingDestroyed && destructionStartTime && pendingBlueskyUrl) {
            const elapsed = Date.now() - destructionStartTime;
            console.log('Destruction elapsed:', elapsed, 'ms'); // Debug log
        }

        sceneRef.current.render();
        animationFrameRef.current = requestAnimationFrame(updateScene);
    };

    useEffect(() => {
        if (!canvasRef.current) return;

        // Initialize audio
        hitAudioRef.current = new Audio('/0x3F8380-boss1weaknesshit.wav');
        hitAudioRef.current.preload = 'auto';
        hitAudioRef.current.volume = 0.7; // Adjust volume as needed
        objectExplodeAudioRef.current = new Audio('0x33AF60-explode01.wav');
        objectExplodeAudioRef.current.preload = 'auto';
        objectExplodeAudioRef.current.volume = 0.5;
        shipExplodeAudioRef.current = new Audio('0xF51C0-explode.wav');
        shipExplodeAudioRef.current.preload = 'auto';
        shipExplodeAudioRef.current.volume = 1;
        laserAudioRef.current = new Audio('0xE0DC0-lasers.wav');
        laserAudioRef.current.preload = 'auto';
        laserAudioRef.current.volume = 1;
        boostAudioRef.current = new Audio('0xE3F80-engines.wav');
        boostAudioRef.current.preload = 'auto';
        boostAudioRef.current.volume = 0.8;
        brakeAudioRef.current = new Audio('0xE7EA0-brake.wav');
        brakeAudioRef.current.preload = 'auto';
        brakeAudioRef.current.volume = 0.8;
        bgMusicAudioRef.current = new Audio('23 Route To Boss.mp3');
        bgMusicAudioRef.current.preload = 'auto';
        bgMusicAudioRef.current.volume = 0.7;
        bgMusicAudioRef.current.loop = true;

        // Initialize engine and scene
        engineRef.current = new Engine(canvasRef.current, true);
        sceneRef.current = new Scene(engineRef.current);
        textWrapperRef.current = new TextWrapper();

        setupScene(sceneRef.current);
        createWallColliders(sceneRef.current);
        
        // Initialize Arwing if in Arwing mode
        if (arwingMode) {
            arwingRef.current = new Arwing(sceneRef.current);
            arwingRef.current.setLaserSoundCallback(playLaserSound);
            arwingRef.current.setBoostSoundCallback(playBoostSound);
            arwingRef.current.setBrakeSoundCallback(playBrakeSound);
            controlsRef.current = new ArwingControlHandler();
            sceneRef.current.activeCamera = arwingRef.current.camera;
        }
        
        cameraRef.current = setupCamera(sceneRef.current);
        texturePoolRef.current = new TexturePool(sceneRef.current, lineHeight);

        // Create connecting message after TexturePool is initialized
        if (textWrapperRef.current && sceneRef.current && texturePoolRef.current) {
            
            const lines = [
                "< CONNECTING TO LIVE",
                " BLUESKY FIREHOSE >"
            ]
            const textureObj = texturePoolRef.current.acquire(lines.length);
            
            // Override font just for connecting message
            const context = textureObj.texture.getContext();
            context.font = `${fontSize}px sans-serif`;  // Remove bold
            
            const { lineCount } = updateTextTexture(textureObj, lines, true, false);
            
            const height = lineCount * 0.75;
            const plane = MeshBuilder.CreatePlane("connecting", {
                width: 7,
                height
            }, sceneRef.current);

            const material = new StandardMaterial("connectingMat", sceneRef.current);
            material.diffuseTexture = textureObj.texture;
            material.specularColor = new Color3(0, 0, 0);
            // Add a green retro glow effect
            material.emissiveColor = new Color3(0.2, 1, 0.2);
            material.backFaceCulling = false;
            material.diffuseTexture.hasAlpha = true;
            material.useAlphaFromDiffuseTexture = true;
            material.transparencyMode = Material.MATERIAL_ALPHABLEND;
            material.alphaMode = Engine.ALPHA_COMBINE;
            material.separateCullingPass = true;
            
            plane.material = material;
            plane.position = new Vector3(0, 0, 4);
            plane.rotation.y = Math.PI;
            (plane as any).renderOrder = 30000; // Ensure it renders on top of everything

            connectingMessageRef.current = {
                mesh: plane,
                textureObj,
                speed: 0,
                special: true,
                arbitraryOrder: 20000,
                createdAt: Date.now() // Ensure createdAt is set when message is created
            };
        }

        // WebSocket with reconnection logic
        let ws: WebSocket | null = null;
        let reconnectTimeout: NodeJS.Timeout | null = null;
        let heartbeatInterval: NodeJS.Timeout | null = null;
        let connectionCheckInterval: NodeJS.Timeout | null = null;
        let reconnectAttempts = 0;
        let shouldReconnect = true;
        let lastMessageTime = Date.now();
        const maxReconnectAttempts = 50; // More attempts
        const baseReconnectDelay = 2000; // Start with 2 seconds
        const connectionTimeout = 10000; // 10 seconds without messages = dead connection

        const connectWebSocket = () => {
            try {
                ws = new WebSocket(websocketUrl);
                
                ws.onopen = () => {
                    reconnectAttempts = 0; // Reset on successful connection
                    lastMessageTime = Date.now();
                    
                    // Start heartbeat to detect connection issues
                    heartbeatInterval = setInterval(() => {
                        if (ws && ws.readyState === WebSocket.OPEN) {
                            try {
                                ws.send('ping');
                            } catch (error) {
                                if (shouldReconnect) {
                                    ws?.close();
                                    scheduleReconnect();
                                }
                            }
                        }
                    }, 5000); // Ping every 5 seconds
                    
                    // Check if we're receiving messages regularly
                    connectionCheckInterval = setInterval(() => {
                        const timeSinceLastMessage = Date.now() - lastMessageTime;
                        if (timeSinceLastMessage > connectionTimeout && ws && ws.readyState === WebSocket.OPEN) {
                            ws.close();
                        }
                    }, 5000);
                };
                
                ws.onmessage = (event) => {
                    lastMessageTime = Date.now(); // Update last message time
                    const data = JSON.parse(event.data);
                    if (data.commit?.record?.text) {
                        createMessage(data.commit.record.text, data);
                    }
                };
                
                ws.onclose = () => {
                    if (heartbeatInterval) {
                        clearInterval(heartbeatInterval);
                        heartbeatInterval = null;
                    }
                    if (connectionCheckInterval) {
                        clearInterval(connectionCheckInterval);
                        connectionCheckInterval = null;
                    }
                    // Always attempt reconnection unless it's a clean shutdown
                    if (shouldReconnect) {
                        scheduleReconnect();
                    }
                };
                
                ws.onerror = () => {
                    // Error will be handled by onclose event
                };
            } catch (error) {
                scheduleReconnect();
            }
        };

        const scheduleReconnect = () => {
            if (!shouldReconnect || reconnectAttempts >= maxReconnectAttempts) {
                return;
            }
            
            const delay = Math.min(baseReconnectDelay + (reconnectAttempts * 1000), 10000); // Linear backoff, max 10s
            
            reconnectTimeout = setTimeout(() => {
                if (shouldReconnect) {
                    reconnectAttempts++;
                    connectWebSocket();
                }
            }, delay);
        };

        // Initial connection
        connectWebSocket();

        // Start render loop
        animationFrameRef.current = requestAnimationFrame(updateScene);

        // Handle resize
        const handleResize = () => {
            engineRef.current?.resize();
        };
        window.addEventListener('resize', handleResize);

        // Start background music on any keyboard input
        const handleKeyDown = () => {
            if (!musicStarted) {
                playBackgroundMusic();
            }
        };
        window.addEventListener('keydown', handleKeyDown);

        // Handle window focus/blur for music control
        const handleWindowBlur = () => {
            pauseBackgroundMusic();
        };
        const handleWindowFocus = () => {
            resumeBackgroundMusic();
        };
        window.addEventListener('blur', handleWindowBlur);
        window.addEventListener('focus', handleWindowFocus);

        // Cleanup
        return () => {
            shouldReconnect = false; // Disable reconnection
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('blur', handleWindowBlur);
            window.removeEventListener('focus', handleWindowFocus);
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
            if (reconnectTimeout) {
                clearTimeout(reconnectTimeout);
            }
            if (heartbeatInterval) {
                clearInterval(heartbeatInterval);
            }
            if (connectionCheckInterval) {
                clearInterval(connectionCheckInterval);
            }
            if (ws) {
                ws.close(1000, 'Component unmounting'); // Clean close
            }
            // Clean up explosion particles
            explosionParticlesRef.current.forEach(particle => {
                particle.mesh.dispose();
            });
            explosionParticlesRef.current = [];
            
            // Clean up exploding pieces
            explodingPiecesRef.current.forEach(piece => {
                piece.mesh.dispose();
            });
            explodingPiecesRef.current = [];
            
            arwingRef.current?.dispose();
            controlsRef.current?.dispose();
            engineRef.current?.dispose();
            texturePoolRef.current?.cleanup();
        };
    }, [websocketUrl, arwingMode]);

    const [isMouseActive, setIsMouseActive] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [showMusic, setShowMusic] = useState(false);
    const [arwingHealth, setArwingHealth] = useState(3);
    const [isArwingDestroyed, setIsArwingDestroyed] = useState(false);
    const [destructionStartTime, setDestructionStartTime] = useState<number | null>(null);
    const [pendingBlueskyUrl, setPendingBlueskyUrl] = useState<string | null>(null);
    const [musicStarted, setMusicStarted] = useState(false);
    const [settings, setSettings] = useState<Settings>({
        discardFraction: discardFraction,
        baseSpeed: 1.5,
        audioMultiplier: 1.0,
        specialFrequency: 0.04,
        audioEnabled: false
    });
    const settingsRef = useRef<Settings>({
        discardFraction: discardFraction,
        baseSpeed: 1.5,
        audioMultiplier: 1.0,
        specialFrequency: 0.04,
        audioEnabled: false
    });
    const analyserRef = useRef<AnalyserNode | null>(null);
    const audioDataRef = useRef<Uint8Array | null>(null);
    const mouseTimeoutRef = useRef<NodeJS.Timeout>();

    const handleMouseMove = () => {
        setIsMouseActive(true);
        
        // Start background music
        if (!musicStarted) {
            playBackgroundMusic();
        }
        
        // Clear existing timeout
        if (mouseTimeoutRef.current) {
            clearTimeout(mouseTimeoutRef.current);
        }
        
        // Set new timeout to hide after 2 seconds
        mouseTimeoutRef.current = setTimeout(() => {
            setIsMouseActive(false);
        }, 2000);
    };

    useEffect(() => {
        // Cleanup timeout on unmount
        return () => {
            if (mouseTimeoutRef.current) {
                clearTimeout(mouseTimeoutRef.current);
            }
        };
    }, []);

    // Handle destruction timer
    useEffect(() => {
        if (isArwingDestroyed && destructionStartTime && pendingBlueskyUrl) {
            console.log('Setting destruction timer for URL:', pendingBlueskyUrl);
            const timer = setTimeout(() => {
                console.log('Destruction timer complete, navigating to:', pendingBlueskyUrl);
                window.open(pendingBlueskyUrl, '_self');
            }, 1500);

            return () => clearTimeout(timer);
        }
    }, [isArwingDestroyed, destructionStartTime, pendingBlueskyUrl]);

    
    return (
        <div 
            style={{ position: 'relative', width: '100%', height: '100%' }} 
            onMouseMove={handleMouseMove}
            onTouchStart={handleMouseMove}
            onTouchMove={handleMouseMove}
        >
            <canvas 
                ref={canvasRef} 
                style={{ width: '100%', height: '100%' }}
                id="renderCanvas"
                onClick={() => {
                    if (!musicStarted) {
                        playBackgroundMusic();
                    }
                }}
                onKeyDown={() => {
                    if (!musicStarted) {
                        playBackgroundMusic();
                    }
                }}
            />
            {/* Health indicator */}
            <div style={{ 
                position: 'absolute', 
                top: '20px', 
                left: '20px',
                transition: 'opacity 0.3s ease-in-out',
                opacity: isMouseActive || arwingHealth < 3 ? 1 : 0.3
            }}>
                <div style={{
                    width: '150px',
                    height: '20px',
                    border: '2px solid #fff',
                    borderRadius: '10px',
                    background: 'linear-gradient(to right, #ff0000, #0000ff)',
                    position: 'relative',
                    overflow: 'hidden',
                    boxShadow: '0 0 10px rgba(255, 255, 255, 0.3)'
                }}>
                    {/* Health fill overlay */}
                    <div style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        background: 'linear-gradient(to right, #ff0000, #0000ff)',
                        clipPath: `inset(0 ${100 - (arwingHealth / 3) * 100}% 0 0)`,
                        transition: 'clip-path 0.3s ease-in-out',
                        boxShadow: 'inset 0 0 10px rgba(0, 0, 0, 0.3)'
                    }} />
                    {/* Empty overlay for depleted health */}
                    <div style={{
                        position: 'absolute',
                        top: 0,
                        right: 0,
                        width: `${100 - (arwingHealth / 3) * 100}%`,
                        height: '100%',
                        backgroundColor: '#333',
                        transition: 'width 0.3s ease-in-out'
                    }} />
                </div>
            </div>

            <div style={{ position: 'absolute', bottom: '20px', right: '20px', display: 'flex', gap: '10px' }}>
                <div
                    className="control-button"
                    style={{
                        opacity: isMouseActive ? .7 : 0,
                    }}
                    onClick={() => {
                        setShowSettings(true);
                        if (!musicStarted) {
                            playBackgroundMusic();
                        }
                    }}
                >
                    <svg 
                        width="24" 
                        height="24" 
                        viewBox="0 0 24 24" 
                        fill="none" 
                        stroke="white" 
                        strokeWidth="2" 
                        strokeLinecap="round" 
                        strokeLinejoin="round"
                    >
                        <circle cx="12" cy="12" r="3"></circle>
                        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                    </svg>
                </div>
            </div>
            
            {/* Destruction overlay effect */}
            {isArwingDestroyed && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'radial-gradient(circle, rgba(255,100,0,0.4) 0%, rgba(255,0,0,0.1) 100%)',
                    pointerEvents: 'none',
                    zIndex: 999,
                    animation: 'flash 0.2s infinite alternate'
                }} />
            )}
            
            {true && (
                <div style={{
                   
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(0, 0, 0, 0.5)',
                    display: showSettings ? 'flex' : 'none',
                    justifyContent: 'center',
                    alignItems: 'center',
                    zIndex: 1000
                }}>
                    <div style={{
                        backgroundColor: '#1a1a1a',
                        padding: '20px',
                        borderRadius: '8px',
                        width: '300px'
                    }}>
                        <h2 style={{ color: 'white', marginTop: 0 }}>Settings</h2>
                        <div style={{ marginBottom: '15px' }}>
                            <label style={{ color: 'white', display: 'block', marginBottom: '5px' }}>
                                Proportion of posts to show:
                            </label>
                            <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.1"
                                value={1 - settings.discardFraction}
                                onChange={(e) => {
                                    const newValue = 1 - parseFloat(e.target.value);
                                    setSettings(prev => ({
                                        ...prev,
                                        discardFraction: newValue
                                    }));
                                    settingsRef.current.discardFraction = newValue;
                                }}
                                style={{ width: '100%' }}
                            />
                            <span style={{ color: 'white' }}>{(100 * (1 - settings.discardFraction)).toFixed(0)}%</span>
                        </div>
                        <div style={{ marginBottom: '15px' }}>
                            <label style={{ color: 'white', display: 'block', marginBottom: '5px' }}>
                                Speed:
                            </label>
                            <input
                                type="range"
                                min="0.1"
                                max="5"
                                step="0.1"
                                value={settings.baseSpeed}
                                onChange={(e) => {
                                    const newValue = parseFloat(e.target.value);
                                    setSettings(prev => ({
                                        ...prev,
                                        baseSpeed: newValue
                                    }));
                                    settingsRef.current.baseSpeed = newValue;
                                }}
                                style={{ width: '100%' }}
                            />
                            <span style={{ color: 'white' }}>{settings.baseSpeed.toFixed(1)}x</span>
                        </div>
                        <div style={{ marginBottom: '15px' }}>
                            <div 
                                onClick={() => {
                                    const newValue = !settings.audioEnabled;
                                    setSettings(prev => ({
                                        ...prev,
                                        audioEnabled: newValue
                                    }));
                                    settingsRef.current.audioEnabled = newValue;
                                    
                                    if (newValue && !analyserRef.current) {
                                        navigator.mediaDevices.getUserMedia({ audio: true, video: false })
                                            .then(stream => {
                                                const audioContext = new AudioContext();
                                                const source = audioContext.createMediaStreamSource(stream);
                                                const webAudioAnalyser = audioContext.createAnalyser();
                                                webAudioAnalyser.fftSize = 32;
                                                webAudioAnalyser.smoothingTimeConstant = 0.4;
                                                source.connect(webAudioAnalyser);
                                                
                                                analyserRef.current = webAudioAnalyser;
                                                audioDataRef.current = new Uint8Array(webAudioAnalyser.frequencyBinCount);
                                            })
                                            .catch(err => {
                                                console.error("Error accessing microphone:", err);
                                                setSettings(prev => ({
                                                    ...prev,
                                                    audioEnabled: false
                                                }));
                                                settingsRef.current.audioEnabled = false;
                                            });
                                    }
                                }}
                                style={{ cursor: 'pointer' }}
                            >
                                <label style={{ color: 'white', display: 'block', marginBottom: '5px' }}>
                                    React to microphone input:
                                </label>
                                <input
                                    type="checkbox"
                                    checked={settings.audioEnabled}
                                    onChange={() => {}} // Handle click on parent div instead
                                style={{ marginRight: '8px' }}
                            />
                            <span style={{ color: 'white' }}>Audio Reactive</span>
                            </div>
                        </div>
                        <div style={{ marginBottom: '15px' }}>
                            <label style={{ color: 'white', display: 'block', marginBottom: '5px' }}>
                                Focal post intensity:
                            </label>
                            <input
                                type="range"
                                min="0"
                                max="0.2"
                                step="0.01"
                                value={settings.specialFrequency}
                                onChange={(e) => {
                                    const newValue = parseFloat(e.target.value);
                                    setSettings(prev => ({
                                        ...prev,
                                        specialFrequency: newValue
                                    }));
                                    settingsRef.current.specialFrequency = newValue;
                                }}
                                style={{ width: '100%' }}
                            />
                            <span style={{ color: 'white' }}>{(settings.specialFrequency * 100).toFixed(1)}%</span>
                        </div>
                        {
                            showMusic?
                            <iframe width="100%" height="100" scrolling="no" frameBorder="no" allow="autoplay" src="https://w.soundcloud.com/player/?url=https%3A//api.soundcloud.com/tracks/961687216&color=%23ff5500&auto_play=false&hide_related=false&show_comments=true&show_user=true&show_reposts=false&show_teaser=true&visual=true"
                            style={{borderRadius:"10px",
                                marginBottom: "15px",


                            }}

                            ></iframe>
                            :
                            <button onClick={() => setShowMusic(true)} style={{
                               // style as link
                             display:"block",
                             textDecoration: "underline",
                                color: "#aaa",
                                backgroundColor: "transparent",
                                marginBottom: "15px",
                            }}>
                                Backing audio (hit "Listen in browser")
                                </button>
                        }

                        <button
                            onClick={() => setShowSettings(false)}
                            style={{
                                backgroundColor: '#333',
                                color: 'white',
                                border: 'none',
                                padding: '8px 16px',
                                borderRadius: '4px',
                                cursor: 'pointer'
                            }}
                        >
                            Close
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BlueSkyViz;
