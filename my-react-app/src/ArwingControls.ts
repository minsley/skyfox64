import { ArwingControls } from './Arwing';

export class ArwingControlHandler {
    private controls: ArwingControls = {
        forward: false,
        backward: false,
        left: false,
        right: false,
        up: false,
        down: false,
        boost: false,
        brake: false,
        fire: false,
        barrelRollLeft: false,
        barrelRollRight: false
    };

    private keys: { [key: string]: boolean } = {};
    private lastAPress = 0;
    private lastDPress = 0;
    private aReleased = true; // Track if A was released since last press
    private dReleased = true; // Track if D was released since last press
    private doubleClickTime = 300; // ms for double-tap detection

    constructor() {
        this.setupEventListeners();
    }

    private setupEventListeners() {
        // Keyboard events
        document.addEventListener('keydown', (event) => {
            this.handleKeyDown(event);
        });

        document.addEventListener('keyup', (event) => {
            this.handleKeyUp(event);
        });

        // Prevent context menu on right-click for mouse controls
        document.addEventListener('contextmenu', (event) => {
            event.preventDefault();
        });

        // Mouse events for additional controls
        document.addEventListener('mousedown', (event) => {
            this.handleMouseDown(event);
        });

        document.addEventListener('mouseup', (event) => {
            this.handleMouseUp(event);
        });
    }

    private handleKeyDown(event: KeyboardEvent) {
        const key = event.key.toLowerCase();
        this.keys[key] = true;

        switch (key) {
            case 'w':
                this.controls.up = true;
                break;
            case 's':
                this.controls.down = true;
                break;
            case 'a':
                this.controls.left = true;
                if (this.aReleased) {
                    this.handleDoubleA();
                    this.aReleased = false; // Mark as not released
                }
                break;
            case 'd':
                this.controls.right = true;
                if (this.dReleased) {
                    this.handleDoubleD();
                    this.dReleased = false; // Mark as not released
                }
                break;
            case 'shift':
                this.controls.boost = true;
                break;
            case 'control':
                this.controls.brake = true;
                break;
            case ' ':
                this.controls.fire = true;
                event.preventDefault(); // Prevent page scroll
                break;
        }
    }

    private handleKeyUp(event: KeyboardEvent) {
        const key = event.key.toLowerCase();
        this.keys[key] = false;

        switch (key) {
            case 'w':
                this.controls.up = false;
                break;
            case 's':
                this.controls.down = false;
                break;
            case 'a':
                this.controls.left = false;
                this.aReleased = true; // Mark as released
                break;
            case 'd':
                this.controls.right = false;
                this.dReleased = true; // Mark as released
                break;
            case 'shift':
                this.controls.boost = false;
                break;
            case 'control':
                this.controls.brake = false;
                break;
            case ' ':
                this.controls.fire = false;
                break;
        }

        // Reset barrel roll flags after a short delay
        setTimeout(() => {
            this.controls.barrelRollLeft = false;
            this.controls.barrelRollRight = false;
        }, 100);
    }

    private handleMouseDown(event: MouseEvent) {
        if (event.button === 0) { // Left mouse button
            this.controls.fire = true;
        }
    }

    private handleMouseUp(event: MouseEvent) {
        if (event.button === 0) { // Left mouse button
            this.controls.fire = false;
        }
    }

    private handleDoubleA() {
        const now = Date.now();
        if (now - this.lastAPress < this.doubleClickTime && this.lastAPress > 0) {
            // Double A pressed - barrel roll left
            this.controls.barrelRollLeft = true;
            console.log("Do a barrel roll! (Left)");
            this.lastAPress = 0; // Reset to prevent multiple triggers
        } else {
            this.lastAPress = now;
        }
    }

    private handleDoubleD() {
        const now = Date.now();
        if (now - this.lastDPress < this.doubleClickTime && this.lastDPress > 0) {
            // Double D pressed - barrel roll right
            this.controls.barrelRollRight = true;
            console.log("Do a barrel roll! (Right)");
            this.lastDPress = 0; // Reset to prevent multiple triggers
        } else {
            this.lastDPress = now;
        }
    }

    public getControls(): ArwingControls {
        return { ...this.controls };
    }

    public showControlsHelp(): string {
        return `
        ARWING CONTROLS:
        
        Flight:
        W/S - Up/Down
        A/D - Left/Right
        
        Combat:
        Space or Left Click - Fire Lasers
        
        Special:
        Shift - Boost
        Ctrl - Brake
        AA (double tap) - Barrel Roll Left
        DD (double tap) - Barrel Roll Right
        `;
    }

    public dispose() {
        // Clean up event listeners if needed
        // In a real implementation, you'd want to store references
        // to the specific event handlers to remove them properly
    }
}