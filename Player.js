// Player.js: Manage player state, movement, and interactions
class Player {
    constructor(scene) {
        this.scene = scene;
        this.character = null;
        this.leftHand = null;
        this.rightHand = null;
        this.characterSpeed = 1.0;
        this.characterYaw = Math.PI; // Face away from camera
        this.targetYaw = Math.PI;
        this.velocity = new THREE.Vector3(0, 0, 0);
        this.lastStep = 0;
        this.useMotion = false;
        this.resources = [];
        this.enemies = [];
        this.animals = [];
        this.portals = []; // Track portals
        this.lastWristTime = 0;
        this.lastLeftWristPos = null;
        this.lastRightWristPos = null;
        this.stepCount = 0; // Track steps for XP
        this.profile = null; // Reference to PlayerProfile for XP

        // Keyboard controls
        this.keys = { ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false };
        window.addEventListener('keydown', (e) => this.keys[e.key] = true);
        window.addEventListener('keyup', (e) => this.keys[e.key] = false);
    }

    setProfile(profile) {
        this.profile = profile; // Set profile for XP awards
    }

    createPlayer(baseHeight) {
        if (this.character) this.scene.remove(this.character);
        if (this.leftHand) this.scene.remove(this.leftHand);
        if (this.rightHand) this.scene.remove(this.rightHand);

        // Create cylinder
        const characterGeometry = new THREE.CylinderGeometry(0.3, 0.3, 1.8, 16);
        const characterMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
        this.character = new THREE.Mesh(characterGeometry, characterMaterial);

        // Add blue rectangle for direction
        const directionGeometry = new THREE.BoxGeometry(0.4, 0.1, 0.2);
        const directionMaterial = new THREE.MeshBasicMaterial({ color: 0x0000ff });
        const directionRectangle = new THREE.Mesh(directionGeometry, directionMaterial);
        directionRectangle.position.set(0, 0.8, 0.3);
        this.character.add(directionRectangle);

        // Add hand spheres
        const handGeometry = new THREE.SphereGeometry(0.1, 16, 16);
        const handMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        this.leftHand = new THREE.Mesh(handGeometry, handMaterial);
        this.rightHand = new THREE.Mesh(handGeometry, handMaterial);
        this.scene.add(this.leftHand, this.rightHand);

        this.character.position.set(0, baseHeight + 0.9, 0);
        this.scene.add(this.character);
    }

    moveCharacter(getTerrainHeight) {
        if (!this.character) return;

        this.character.position.x += this.velocity.x;
        this.character.position.z += this.velocity.z;

        this.character.position.x = Math.max(-25, Math.min(25, this.character.position.x));
        this.character.position.z = Math.max(-25, Math.min(25, this.character.position.z));

        let height = 0;
        if (typeof getTerrainHeight === 'function') {
            height = getTerrainHeight(this.character.position.x, this.character.position.z);
        } else {
            console.warn('getTerrainHeight is not a function, using default height');
        }
        this.character.position.y = height + 0.9;

        // Check portal proximity for interaction
        this.portals.forEach(portal => {
            if (this.character.position.distanceTo(portal.position) < 1.5) {
                // Punching handled in MotionCapture.js, but log proximity
                console.log(`Near portal to ${portal.userData.href}`);
            }
        });
    }

    update(getTerrainHeight) {
        if (!this.character) return;

        // Update movement
        const now = performance.now();
        const decay = Math.exp(-(now - this.lastStep) / 500);
        this.velocity.multiplyScalar(decay);
        this.moveCharacter(getTerrainHeight);

        // Update rotation
        this.characterYaw = THREE.MathUtils.lerp(this.characterYaw, this.targetYaw, 0.1);
        this.character.rotation.y = -this.characterYaw;

        // Keyboard controls
        if (!this.useMotion) {
            const speed = 0.2;
            if (this.keys.ArrowUp) {
                this.velocity.set(
                    Math.sin(this.characterYaw) * speed,
                    0,
                    Math.cos(this.characterYaw) * speed
                );
                this.lastStep = now;
                this.stepCount++;
                if (this.profile) {
                    this.profile.awardXP('walking', 1);
                    if (this.stepCount >= 2112) { // 1 mile = ~2112 steps
                        this.profile.awardXP('walking', 100);
                        this.stepCount = 0;
                    }
                }
            }
            if (this.keys.ArrowLeft) this.targetYaw += 0.05;
            if (this.keys.ArrowRight) this.targetYaw -= 0.05;
        } else {
            // Motion-based step counting
            if (this.velocity.length() > 0) {
                this.stepCount++;
                if (this.profile) {
                    this.profile.awardXP('walking', 1);
                    if (this.stepCount >= 2112) {
                        this.profile.awardXP('walking', 100);
                        this.stepCount = 0;
                    }
                }
            }
        }
    }
}