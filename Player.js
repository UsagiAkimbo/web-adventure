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

        // Interaction tracking
        this.resources = [];
        this.enemies = [];
        this.animals = [];
        this.punchThreshold = 0.7; // Velocity for punch detection
        this.lastLeftWristPos = null;
        this.lastRightWristPos = null;
        this.lastWristTime = 0;

        // Keyboard controls
        this.keys = { ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false };
        window.addEventListener('keydown', (e) => this.keys[e.key] = true);
        window.addEventListener('keyup', (e) => this.keys[e.key] = false);
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

        const height = getTerrainHeight(this.character.position.x, this.character.position.z);
        this.character.position.y = height + 0.9;
    }

    handlePunch(poseData, getTerrainHeight) {
        if (!poseData || !this.character) return;

        const landmarks = poseData.landmarks;
        const leftWrist = landmarks[15];
        const rightWrist = landmarks[16];
        const now = performance.now();
        const dt = (now - this.lastWristTime) / 1000;
        this.lastWristTime = now;

        if (leftWrist && rightWrist) {
            // Map wrist positions to 3D
            const playerPos = this.character.position;
            const armReach = 0.8;
            const leftHandPos = new THREE.Vector3(
                playerPos.x + (0.5 - leftWrist.x) * armReach,
                playerPos.y + (0.5 - leftWrist.y) * armReach,
                playerPos.z + leftWrist.z * armReach
            );
            const rightHandPos = new THREE.Vector3(
                playerPos.x + (0.5 - rightWrist.x) * armReach,
                playerPos.y + (0.5 - rightWrist.y) * armReach,
                playerPos.z + rightWrist.z * armReach
            );

            // Update hand spheres
            if (this.leftHand) this.leftHand.position.copy(leftHandPos);
            if (this.rightHand) this.rightHand.position.copy(rightHandPos);

            // Detect punches
            let leftPunchVelocity = 0;
            let rightPunchVelocity = 0;
            if (this.lastLeftWristPos && dt > 0) {
                const delta = leftHandPos.clone().sub(this.lastLeftWristPos);
                const forwardDir = new THREE.Vector3(Math.sin(this.characterYaw), 0, Math.cos(this.characterYaw));
                leftPunchVelocity = delta.dot(forwardDir) / dt;
            }
            if (this.lastRightWristPos && dt > 0) {
                const delta = rightHandPos.clone().sub(this.lastRightWristPos);
                const forwardDir = new THREE.Vector3(Math.sin(this.characterYaw), 0, Math.cos(this.characterYaw));
                rightPunchVelocity = delta.dot(forwardDir) / dt;
            }
            this.lastLeftWristPos = leftHandPos.clone();
            this.lastRightWristPos = rightHandPos.clone();

            // Check for punches
            const punchRadius = 0.8;
            if (leftPunchVelocity > this.punchThreshold || rightPunchVelocity > this.punchThreshold) {
                const handPos = leftPunchVelocity > rightPunchVelocity ? leftHandPos : rightHandPos;
                const handLabel = leftPunchVelocity > rightPunchVelocity ? 'left' : 'right';

                for (const resource of this.resources) {
                    if (handPos.distanceTo(resource.position) < punchRadius) {
                        console.log(`Punched resource with ${handLabel} hand at (${resource.position.x.toFixed(2)}, ${resource.position.y.toFixed(2)}, ${resource.position.z.toFixed(2)})!`);
                    }
                }
                for (const enemy of this.enemies) {
                    if (handPos.distanceTo(enemy.position) < punchRadius) {
                        console.log(`Punched enemy with ${handLabel} hand at (${enemy.position.x.toFixed(2)}, ${enemy.position.y.toFixed(2)}, ${enemy.position.z.toFixed(2)})!`);
                    }
                }
                for (const animal of this.animals) {
                    if (handPos.distanceTo(animal.position) < punchRadius) {
                        console.log(`Punched animal (${animal.userData.type}) with ${handLabel} hand at (${animal.position.x.toFixed(2)}, ${animal.position.y.toFixed(2)}, ${animal.position.z.toFixed(2)})!`);
                    }
                }
            }
        }
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
            }
            if (this.keys.ArrowLeft) this.targetYaw += 0.05;
            if (this.keys.ArrowRight) this.targetYaw -= 0.05;
        }
    }
}