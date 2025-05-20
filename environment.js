// environment.js: Generate Three.js environment with motion-driven character and animals
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
        this.characterSpeed = 0.5;
        this.characterYaw = 0;

        // Controls (arrow keys or motion)
        this.useMotion = false;
        this.useShoulders = true; // True for shoulders, false for hips
        this.keys = { ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false };
        window.addEventListener('keydown', (e) => this.keys[e.key] = true);
        window.addEventListener('keyup', (e) => this.keys[e.key] = false);

        // Motion tracking with MediaPipe Pose
        this.videoElement = document.createElement('video');
        this.videoElement.style.display = 'none';
        document.body.appendChild(this.videoElement);
        this.lastStepTime = 0;
        this.stepCooldown = 500;
        this.leftKneeUp = false;
        this.rightKneeUp = false;
        this.motionInitialized = false;
        this.setupMotionTracking();

        // Terrain and animals
        this.terrain = null;
        this.water = null;
        this.animals = []; // Track animal meshes for movement

        this.animate();
    }

    async setupMotionTracking() {
        this.pose = new Pose({
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
        });
        this.pose.setOptions({
            modelComplexity: 1,
            smoothLandmarks: true,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
        });
        this.pose.onResults((results) => this.onPoseResults(results));
    }

    async startMotionTracking() {
        if (this.motionInitialized) return;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            this.videoElement.srcObject = stream;
            this.videoElement.play();
            const camera = new Camera(this.videoElement, {
                onFrame: async () => await this.pose.send({ image: this.videoElement }),
                width: 640,
                height: 480
            });
            camera.start();
            this.motionInitialized = true;
            document.getElementById('motionStatus').textContent = 'Webcam active';
        } catch (error) {
            console.error('Error starting webcam:', error.message);
            document.getElementById('motionStatus').textContent = 'Webcam unavailable. Use arrow keys.';
            this.useMotion = false;
            document.getElementById('motionToggle').checked = false;
        }
    }

    onPoseResults(results) {
        if (!results.poseLandmarks || !this.useMotion) return;

        // Walking detection
        const leftKnee = results.poseLandmarks[25];
        const rightKnee = results.poseLandmarks[26];
        const leftHip = results.poseLandmarks[23];
        const rightHip = results.poseLandmarks[24];

        if (leftKnee && rightKnee && leftHip && rightHip) {
            const leftKneeHeight = leftKnee.y - leftHip.y;
            const rightKneeHeight = rightKnee.y - rightHip.y;
            const kneeThreshold = -0.05;

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

        // Turning detection (shoulders or hips)
        if (this.useShoulders) {
            const leftShoulder = results.poseLandmarks[11];
            const rightShoulder = results.poseLandmarks[12];
            if (leftShoulder && rightShoulder) {
                const tilt = (leftShoulder.y - rightShoulder.y) * 5; // Amplify for sensitivity
                this.characterYaw += tilt * 0.02; // Turn speed
            }
        } else {
            const leftHip = results.poseLandmarks[23];
            const rightHip = results.poseLandmarks[24];
            if (leftHip && rightHip) {
                const tilt = (rightHip.y - leftHip.y) * 5; // Reverse for intuitive leaning
                this.characterYaw += tilt * 0.02;
            }
        }
    }

    moveCharacter() {
        if (!this.character || !this.terrain) return;

        const dx = Math.sin(this.characterYaw) * this.characterSpeed;
        const dz = Math.cos(this.characterYaw) * this.characterSpeed;
        this.character.position.x += dx;
        this.character.position.z += dz;

        this.character.position.x = Math.max(-25, Math.min(25, this.character.position.x));
        this.character.position.z = Math.max(-25, Math.min(25, this.character.position.z));

        const height = this.getTerrainHeight(this.character.position.x, this.character.position.z);
        this.character.position.y = height + 0.9;

        this.camera.position.set(
            this.character.position.x,
            this.character.position.y + 5,
            this.character.position.z + 10
        );
        this.camera.lookAt(this.character.position);
    }

    getTerrainHeight(x, z) {
        if (!this.terrain) return 0;

        const geometry = this.terrain.geometry;
        const vertices = geometry.attributes.position.array;
        const gridSize = 32;
        const terrainSize = 50;

        const u = (x + terrainSize / 2) / terrainSize * gridSize;
        const v = (z + terrainSize / 2) / terrainSize * gridSize;
        const i = Math.floor(u);
        const j = Math.floor(v);
        if (i < 0 || i >= gridSize || j < 0 || j >= gridSize) return 0;

        const index = (j * (gridSize + 1) + i) * 3 + 2;
        return vertices[index] || 0;
    }

    updateAnimals() {
        this.animals.forEach(animal => {
            // Simple random movement
            animal.position.x += (Math.random() - 0.5) * 0.1;
            animal.position.z += (Math.random() - 0.5) * 0.1;
            animal.position.x = Math.max(-25, Math.min(25, animal.position.x));
            animal.position.z = Math.max(-25, Math.min(25, animal.position.z));
            animal.position.y = this.getTerrainHeight(animal.position.x, animal.position.z) + animal.userData.height;
        });
    }

    generate(data) {
        while (this.scene.children.length > 2) {
            this.scene.remove(this.scene.children[2]);
        }
        this.animals = [];

        // Land terrain (<div>)
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

        // Water terrain (<table>)
        const waterGeometry = new THREE.PlaneGeometry(50, 50, 32, 32);
        const waterVertices = waterGeometry.attributes.position.array;
        for (let i = 2; i < waterVertices.length; i += 3) {
            waterVertices[i] = Math.sin(i * data.waterComplexity / 50 + performance.now() * 0.001) * 0.5 - 1; // Waves, below land
        }
        waterGeometry.attributes.position.needsUpdate = true;
        const waterMaterial = new THREE.MeshBasicMaterial({ color: 0x0000ff, opacity: 0.5, transparent: true });
        this.water = new THREE.Mesh(waterGeometry, waterMaterial);
        this.water.rotation.x = -Math.PI / 2;
        this.scene.add(this.water);

        // Resources (<img>): Blue cubes
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

        // Enemies (<script>): Red spheres
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

        // Animals (<a>): Spheres (birds), toruses (fish), cones (beasts)
        const animalTypes = [
            { type: 'bird', geometry: new THREE.SphereGeometry(0.3, 16, 16), material: new THREE.MeshBasicMaterial({ color: 0x00ffff }), height: 1.5 },
            { type: 'fish', geometry: new THREE.TorusGeometry(0.4, 0.1, 16, 32), material: new THREE.MeshBasicMaterial({ color: 0x0000ff }), height: -0.5 },
            { type: 'beast', geometry: new THREE.ConeGeometry(0.5, 1, 16), material: new THREE.MeshBasicMaterial({ color: 0xff00ff }), height: 0.5 }
        ];
        for (let i = 0; i < data.animals; i++) {
            // Distribute types based on animalTypeFactor (href length)
            const typeIndex = Math.min(Math.floor(data.animalTypeFactor / 50), 2); // 0-50: bird, 50-100: fish, 100+: beast
            const animalDef = animalTypes[typeIndex] || animalTypes[0];
            const animal = new THREE.Mesh(animalDef.geometry, animalDef.material);
            animal.position.set(
                Math.random() * 40 - 20,
                this.getTerrainHeight(animal.position.x, animal.position.z) + animalDef.height,
                Math.random() * 40 - 20
            );
            animal.userData = { height: animalDef.height };
            this.scene.add(animal);
            this.animals.push(animal);
        }

        // Structures (<ul>): Yellow boxes
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

        // Interactables (<span>): Gray spheres
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

        // Vegetation (<form>): Green cones (trees)
        const vegetationGeometry = new THREE.ConeGeometry(0.5, 2, 16);
        const vegetationMaterial = new THREE.MeshBasicMaterial({ color: 0x008800 });
        for (let i = 0; i < data.vegetation; i++) {
            const tree = new THREE.Mesh(vegetationGeometry, vegetationMaterial);
            tree.position.set(
                Math.random() * 40 - 20,
                this.getTerrainHeight(tree.position.x, tree.position.z) + 1,
                Math.random() * 40 - 20
            );
            this.scene.add(tree);
        }

        // Hazards (<input>): Red spikes (cones)
        const hazardGeometry = new THREE.ConeGeometry(0.3, 1, 16);
        const hazardMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        for (let i = 0; i < data.hazards; i++) {
            const hazard = new THREE.Mesh(hazardGeometry, hazardMaterial);
            hazard.position.set(
                Math.random() * 40 - 20,
                this.getTerrainHeight(hazard.position.x, hazard.position.z) + 0.5,
                Math.random() * 40 - 20
            );
            this.scene.add(hazard);
        }

        // Atmosphere (<meta>): Fog
        this.scene.fog = new THREE.Fog(0x000000, 10, 50 - data.atmosphere * 2);

        // Character
        if (this.character) this.scene.remove(this.character);
        const characterGeometry = new THREE.CylinderGeometry(0.3, 0.3, 1.8, 16);
        const characterMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
        this.character = new THREE.Mesh(characterGeometry, characterMaterial);
        this.character.position.set(0, this.getTerrainHeight(0, 0) + 0.9, 0);
        this.scene.add(this.character);
    }

    animate() {
        requestAnimationFrame(() => this.animate());

        // Update water waves
        if (this.water) {
            const vertices = this.water.geometry.attributes.position.array;
            for (let i = 2; i < vertices.length; i += 3) {
                vertices[i] = Math.sin(i * 10 / 50 + performance.now() * 0.001) * 0.5 - 1;
            }
            this.water.geometry.attributes.position.needsUpdate = true;
        }

        // Update animals
        this.updateAnimals();

        // Keyboard controls
        if (!this.useMotion) {
            const speed = 0.1;
            if (this.keys.ArrowUp) this.moveCharacter();
            if (this.keys.ArrowLeft) this.characterYaw += 0.05;
            if (this.keys.ArrowRight) this.characterYaw -= 0.05;
            if (this.character) {
                this.character.rotation.y = -this.characterYaw;
            }
        } else if (this.character) {
            this.character.rotation.y = -this.characterYaw;
        }

        this.renderer.render(this.scene, this.camera);
    }
}
