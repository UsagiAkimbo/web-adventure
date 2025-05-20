// Player.js: Manage player state, movement, and interactions
class Player {
    constructor(scene) {
        this.scene = scene;
        this.character = null;
        this.leftHand = null;
        this.rightHand = null;
        this.characterSpeed = 1.0;
        this.characterYaw = Math.PI;
        this.targetYaw = Math.PI;
        this.velocity = new THREE.Vector3(0, 0, 0);
        this.lastStep = 0;
        this.useMotion = false;
        this.resources = [];
        this.enemies = [];
        this.animals = [];
        this.portals = [];
        this.lastWristTime = 0;
        this.lastLeftWristPos = null;
        this.lastRightWristPos = null;
        this.stepCount = 0;
        this.profile = null;

        this.keys = { ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false };
        window.addEventListener('keydown', (e) => this.keys[e.key] = true);
        window.addEventListener('keyup', (e) => this.keys[e.key] = false);
    }

    setProfile(profile) {
        this.profile = profile;
        console.log('Profile set for player:', !!profile.awardXP);
    }

    createPlayer(baseHeight) {
        if (this.character) this.scene.remove(this.character);
        if (this.leftHand) this.scene.remove(this.leftHand);
        if (this.rightHand) this.scene.remove(this.rightHand);

        const characterGeometry = new THREE.CylinderGeometry(0.3, 0.3, 1.8, 16);
        const characterMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
        this.character = new THREE.Mesh(characterGeometry, characterMaterial);

        const directionGeometry = new THREE.BoxGeometry(0.4, 0.1, 0.2);
        const directionMaterial = new THREE.MeshBasicMaterial({ color: 0x0000ff });
        const directionRectangle = new THREE.Mesh(directionGeometry, directionMaterial);
        directionRectangle.position.set(0, 0.8, 0.3);
        this.character.add(directionRectangle);

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

        this.portals.forEach(portal => {
            if (this.character.position.distanceTo(portal.position) < 1.5) {
                console.log(`Near portal to ${portal.userData.href}`);
            }
        });
    }

    update(getTerrainHeight) {
        if (!this.character) return;

        const now = performance.now();
        const decay = Math.exp(-(now - this.lastStep) / 500);
        this.velocity.multiplyScalar(decay);
        this.moveCharacter(getTerrainHeight);

        this.characterYaw = THREE.MathUtils.lerp(this.characterYaw, this.targetYaw, 0.1);
        this.character.rotation.y = -this.characterYaw;

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
                if (this.profile && typeof this.profile.awardXP === 'function') {
                    this.profile.awardXP('walking', 1);
                    if (this.stepCount >= 2112) {
                        this.profile.awardXP('walking', 100);
                        this.stepCount = 0;
                    }
                }
            }
            if (this.keys.ArrowLeft) this.targetYaw += 0.05;
            if (this.keys.ArrowRight) this.targetYaw -= 0.05;
        } else {
            if (this.velocity.length() > 0) {
                this.stepCount++;
                if (this.profile && typeof this.profile.awardXP === 'function') {
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