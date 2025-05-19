// environment.js: Generate Three.js environment with a motion-driven character
class EnvironmentGenerator {
    constructor(canvas) {
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ canvas });
        this.renderer.setSize(window.innerWidth, window.innerHeight);

        this.camera.position.set(0, 10, 20);
        this.camera.lookAt(0, 0, 0);

        // Add basic lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambientLight);
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
        directionalLight.position.set(0, 10, 10);
        this.scene.add(directionalLight);

        // Character (green cylinder)
        this.character = null;
        this.characterSpeed = 0.5; // Distance per step
        this.characterYaw = 0; // Facing direction (radians)

        // Controls (arrow keys or motion)
        this.useMotion = false; // Toggle motion tracking
        this.keys = { ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false };
        window.addEventListener('keydown', (e) => this.keys[e.key] = true);
        window.addEventListener('keyup', (e) => this.keys[e.key] = false);

        // Motion tracking with MediaPipe Pose
        this.videoElement = document.createElement('video');
        this.videoElement.style.display = 'none'; // Hidden video feed
        document.body.appendChild(this.videoElement);
        this.lastStepTime = 0;
        this.stepCooldown = 500; // Min time between steps (ms)
        this.leftKneeUp = false;
        this.rightKneeUp = false;
        this.setupMotionTracking();

        // Terrain reference for height sampling
        this.terrain = null;

        this.animate();
    }

    async setupMotionTracking() {
        // Load MediaPipe Pose
        const pose = new Pose({
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
        });
        pose.setOptions({
            modelComplexity: 1,
            smoothLandmarks: true,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
        });
        pose.onResults((results) => this.onPoseResults(results));

        // Start webcam
        if (navigator.mediaDevices.getUserMedia) {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            this.videoElement.srcObject = stream;
            this.videoElement.play();
            const camera = new Camera(this.videoElement, {
                onFrame: async () => await pose.send({ image: this.videoElement }),
                width: 640,
                height: 480
            });
            camera.start();
        }
    }

    onPoseResults(results) {
        if (!results.poseLandmarks || !this.useMotion) return;

        // Detect walking in place (alternating knee lifts)
        const leftKnee = results.poseLandmarks[25]; // Left knee
        const rightKnee = results.poseLandmarks[26]; // Right knee
        const leftHip = results.poseLandmarks[23]; // Left hip
        const rightHip = results.poseLandmarks[24]; // Right hip

        if (leftKnee && rightKnee && leftHip && rightHip) {
            const leftKneeHeight = leftKnee.y - leftHip.y;
            const rightKneeHeight = rightKnee.y - rightHip.y;
            const kneeThreshold = -0.05; // Knee lift threshold

            const now = performance.now();
            if (leftKneeHeight < kneeThreshold && !this.leftKneeUp && now - this.lastStepTime > this.stepCooldown) {
                this.leftKneeUp = true;
                this.moveCharacter();
                this.lastStepTime = now;
            } else if (rightKneeHeight < kneeThreshold && !this.rightKneeUp && now - this.lastStepTime > this.stepCooldown) {
                this.rightKneeUp = true;
                this.moveCharacter();
                this.lastStepTime = now;
            }
            if (leftKneeHeight >= kneeThreshold) this.leftKneeUp = false;
            if (rightKneeHeight >= kneeThreshold) this.rightKneeUp = false;
        }
    }

    moveCharacter() {
        if (!this.character || !this.terrain) return;

        // Move forward based on yaw
        const dx = Math.sin(this.characterYaw) * this.characterSpeed;
        const dz = Math.cos(this.characterYaw) * this.characterSpeed;
        this.character.position.x += dx;
        this.character.position.z += dz;

        // Clamp position to terrain bounds
        this.character.position.x = Math.max(-25, Math.min(25, this.character.position.x));
        this.character.position.z = Math.max(-25, Math.min(25, this.character.position.z));

        // Update y-position to follow terrain
        const height = this.getTerrainHeight(this.character.position.x, this.character.position.z);
        this.character.position.y = height + 1; // Offset to stand on surface

        // Update camera to follow character
        this.camera.position.set(
            this.character.position.x,
            this.character.position.y + 5,
            this.character.position.z + 10
        );
        this.camera.lookAt(this.character.position);
    }

    getTerrainHeight(x, z) {
        if (!this.terrain) return 0;

        // Sample terrain height from PlaneGeometry
        const geometry = this.terrain.geometry;
        const vertices = geometry.attributes.position.array;
        const gridSize = 32; // PlaneGeometry segments
        const terrainSize = 50; // PlaneGeometry width/height

        // Normalize x, z to grid coordinates
        const u = (x + terrainSize / 2) / terrainSize * gridSize;
        const v = (z + terrainSize / 2) / terrainSize * gridSize;
        const i = Math.floor(u);
        const j = Math.floor(v);
        if (i < 0 || i >= gridSize || j < 0 || j >= gridSize) return 0;

        // Get height at grid point
        const index = (j * (gridSize + 1) + i) * 3 + 2; // z-coordinate in vertices
        return vertices[index] || 0;
    }

    generate(data) {
        // Clear previous scene objects
        while (this.scene.children.length > 2) {
            this.scene.remove(this.scene.children[2]);
        }

        // Terrain: Plane with height variation
        const terrainGeometry = new THREE.PlaneGeometry(50, 50, 32, 32);
        const vertices = terrainGeometry.attributes.position.array;
        for (let i = 2; i < vertices.length; i += 3) {
            vertices[i] = Math.sin(i * data.terrainComplexity / 50) * 2;
        }
        terrainGeometry.attributes.position.needsUpdate = true;
        const terrainMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: true });
        this.terrain = new THREE.Mesh(terrainGeometry, terrainMaterial);
        this.terrain.rotation.x = -Math.PI / 2;
        this.scene.add(this.terrain);

        // Resources: Blue cubes
        const resourceGeometry = new THREE.BoxGeometry(1, 1, 1);
        const resourceMaterial = new THREE.MeshBasicMaterial({ color: 0x0000ff });
        for (let i = 0; i < data.resources; i++) {
            const resource = new THREE.Mesh(resourceGeometry, resourceMaterial);
            resource.position.set(
                Math.random() * 40 - 20,
                this.getTerrainHeight(resource.position.x, resource.position.z) + 0.5,
                Math.random() * 40 - 20
            );
            this.scene.add(resource);
        }

        // Enemies: Red spheres
        const enemyGeometry = new THREE.SphereGeometry(0.5, 16, 16);
        const enemyMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        for (let i = 0; i < data.enemies; i++) {
            const enemy = new THREE.Mesh(enemyGeometry, enemyMaterial);
            enemy.position.set(
                Math.random() * 40 - 20,
                this.getTerrainHeight(enemy.position.x, enemy.position.z) + 0.5,
                Math.random() * 40 - 20
            );
            this.scene.add(enemy);
        }

        // NPCs: Green cylinders
        const npcGeometry = new THREE.CylinderGeometry(0.5, 0.5, 2, 16);
        const npcMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
        for (let i = 0; i < data.npcs; i++) {
            const npc = new THREE.Mesh(npcGeometry, npcMaterial);
            npc.position.set(
                Math.random() * 40 - 20,
                this.getTerrainHeight(npc.position.x, npc.position.z) + 1,
                Math.random() * 40 - 20
            );
            this.scene.add(npc);
        }

        // Structures: Yellow boxes
        const structureGeometry = new THREE.BoxGeometry(2, 2, 2);
        const structureMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00 });
        for (let i = 0; i < data.structures; i++) {
            const structure = new THREE.Mesh(structureGeometry, structureMaterial);
            structure.position.set(
                Math.random() * 40 - 20,
                this.getTerrainHeight(structure.position.x, structure.position.z) + 1,
                Math.random() * 40 - 20
            );
            this.scene.add(structure);
        }

        // Placeholders for interactables, obstacles, paths, collectibles
        const interactableMaterial = new THREE.MeshBasicMaterial({ color: 0xaaaaaa });
        for (let i = 0; i < data.interactables; i++) {
            const interactable = new THREE.Mesh(enemyGeometry, interactableMaterial);
            interactable.position.set(
                Math.random() * 40 - 20,
                this.getTerrainHeight(interactable.position.x, interactable.position.z) + 0.5,
                Math.random() * 40 - 20
            );
            this.scene.add(interactable);
        }

        // Atmosphere: Fog
        this.scene.fog = new THREE.Fog(0x000000, 10, 50 - data.atmosphere * 2);

        // Add character
        if (this.character) this.scene.remove(this.character);
        const characterGeometry = new THREE.CylinderGeometry(0.3, 0.3, 1.8, 16);
        const characterMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
        this.character = new THREE.Mesh(characterGeometry, characterMaterial);
        this.character.position.set(0, this.getTerrainHeight(0, 0) + 0.9, 0);
        this.scene.add(this.character);
    }

    animate() {
        requestAnimationFrame(() => this.animate());

        // Keyboard controls (if not using motion)
        if (!this.useMotion) {
            const speed = 0.1;
            if (this.keys.ArrowUp) this.moveCharacter();
            if (this.keys.ArrowLeft) this.characterYaw += 0.05;
            if (this.keys.ArrowRight) this.characterYaw -= 0.05;
            if (this.character) {
                this.character.rotation.y = -this.characterYaw;
            }
        }

        this.renderer.render(this.scene, this.camera);
    }
}