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
        this.characterSpeed = 1.0;
        this.characterYaw = Math.PI; // Face away from camera (negative z-axis)
        this.targetYaw = Math.PI; // Initialize target yaw
        this.velocity = new THREE.Vector3(0, 0, 0);
        this.lastStep = 0;

        // Controls (arrow keys or motion)
        this.useMotion = false;
        this.useShoulders = true;
        this.keys = { ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false };
        window.addEventListener('keydown', (e) => this.keys[e.key] = true);
        window.addEventListener('keyup', (e) => this.keys[e.key] = false);

        // Motion tracking with MediaPipe Pose
        this.videoElement = document.createElement('video');
        this.videoElement.style.display = 'none';
        document.body.appendChild(this.videoElement);
        this.lastStepTime = 0;
        this.stepCooldown = 300;
        this.leftKneeUp = false;
        this.rightKneeUp = false;
        this.motionInitialized = false;
        this.cameras = [];
        this.currentCameraIndex = 0;
        this.cameraSwitchCooldown = false;
        this.setupMotionTracking();

        // Terrain and animals
        this.terrain = null;
        this.water = null;
        this.animals = [];

        this.animate();
    }

    async setupMotionTracking() {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            this.cameras = devices.filter(device => device.kind === 'videoinput');
            console.log('Available cameras:', this.cameras.map(d => d.label || 'Unnamed'));
            // Prioritize HP Wide Vision HD Camera
            const preferredCamera = this.cameras.find(c => c.label.includes('HP Wide Vision HD Camera')) || this.cameras[0];
            this.currentCameraIndex = this.cameras.indexOf(preferredCamera);
            // Load saved camera preference
            const savedDeviceId = localStorage.getItem('preferredCameraId');
            if (savedDeviceId) {
                const savedIndex = this.cameras.findIndex(c => c.deviceId === savedDeviceId);
                if (savedIndex !== -1) this.currentCameraIndex = savedIndex;
            }
        } catch (error) {
            console.error('Error listing cameras:', error.message);
        }

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
        let attempts = 0;
        const maxAttempts = 3;
        while (attempts < maxAttempts) {
            try {
                const constraints = {
                    video: this.cameras.length > 0 ? { deviceId: this.cameras[this.currentCameraIndex].deviceId, width: 640, height: 480 } : { width: 640, height: 480 }
                };
                const stream = await navigator.mediaDevices.getUserMedia(constraints);
                this.videoElement.srcObject = stream;
                const videoFeed = document.getElementById('videoFeed');
                videoFeed.srcObject = stream;

                // Wait for video to be ready
                await new Promise((resolve, reject) => {
                    this.videoElement.onloadedmetadata = () => {
                        if (this.videoElement.videoWidth > 0 && this.videoElement.videoHeight > 0) {
                            console.log('Video dimensions:', this.videoElement.videoWidth, 'x', this.videoElement.videoHeight);
                            resolve();
                        } else {
                            reject(new Error('Invalid video dimensions'));
                        }
                    };
                    this.videoElement.onerror = () => reject(new Error('Video element error'));
                    setTimeout(() => reject(new Error('Video metadata timeout')), 5000);
                });

                await this.videoElement.play().catch(error => {
                    console.error('Video play error:', error.message);
                    if (error.name !== 'AbortError') throw error;
                });
                await videoFeed.play().catch(error => {
                    console.error('Video feed play error:', error.message);
                    if (error.name !== 'AbortError') throw error;
                });

                console.log('Webcam stream started:', stream.active, 'Camera:', this.cameras[this.currentCameraIndex]?.label || 'Default');
                document.getElementById('videoStatus').textContent = `Camera: ${this.cameras[this.currentCameraIndex]?.label || 'Default'}`;
                localStorage.setItem('preferredCameraId', this.cameras[this.currentCameraIndex]?.deviceId || '');

                const camera = new Camera(this.videoElement, {
                    onFrame: async () => {
                        if (this.videoElement.videoWidth > 0 && this.videoElement.videoHeight > 0) {
                            await this.pose.send({ image: this.videoElement });
                        }
                    },
                    width: 640,
                    height: 480
                });
                camera.start();
                this.motionInitialized = true;
                document.getElementById('motionStatus').textContent = 'Webcam active';
                document.getElementById('poseStatus').textContent = 'Pose detection active';
                return;
            } catch (error) {
                console.error('Attempt', attempts + 1, 'failed:', error.message);
                attempts++;
                if (attempts >= maxAttempts) {
                    console.error('Max attempts reached. Motion tracking failed.');
                    document.getElementById('motionStatus').textContent = 'Webcam unavailable. Use arrow keys.';
                    document.getElementById('videoStatus').textContent = 'No video stream';
                    document.getElementById('poseStatus').textContent = 'Pose detection failed';
                    this.useMotion = false;
                    document.getElementById('motionToggle').checked = false;
                    document.getElementById('videoToggle').checked = false;
                    document.getElementById('videoFeed').style.display = 'none';
                }
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
    }

    async stopMotionTracking() {
        if (!this.motionInitialized) return;
        if (this.videoElement.srcObject) {
            this.videoElement.srcObject.getTracks().forEach(track => track.stop());
            this.videoElement.srcObject = null;
            document.getElementById('videoFeed').srcObject = null;
        }
        this.motionInitialized = false;
    }

    async cycleCamera() {
        if (this.cameras.length <= 1) {
            console.log('No additional cameras available');
            return;
        }
        if (this.cameraSwitchCooldown) {
            console.log('Camera switch on cooldown');
            return;
        }
        this.cameraSwitchCooldown = true;
        await this.stopMotionTracking();
        this.currentCameraIndex = (this.currentCameraIndex + 1) % this.cameras.length;
        await this.startMotionTracking();
        setTimeout(() => {
            this.cameraSwitchCooldown = false;
        }, 1000);
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
                this.lastStep = now;
                this.velocity.set(
                    Math.sin(this.characterYaw) * this.characterSpeed,
                    0,
                    Math.cos(this.characterYaw) * this.characterSpeed
                );
                this.lastStepTime = now;
            } else if (rightKneeHeight < kneeThreshold && !this.rightKneeUp && now - this.lastStepTime > this.stepCooldown) {
                this.rightKneeUp = true;
                this.lastStep = now;
                this.velocity.set(
                    Math.sin(this.characterYaw) * this.characterSpeed,
                    0,
                    Math.cos(this.characterYaw) * this.characterSpeed
                );
                this.lastStepTime = now;
            }
            if (leftKneeHeight >= kneeThreshold) this.leftKneeUp = false;
            if (rightKneeHeight >= kneeThreshold) this.rightKneeUp = false;
        }

        // Turning detection
        if (this.useShoulders) {
            const leftShoulder = results.poseLandmarks[11];
            const rightShoulder = results.poseLandmarks[12];
            if (leftShoulder && rightShoulder) {
                const tilt = (leftShoulder.y - rightShoulder.y) * 5;
                this.targetYaw += tilt * 0.02;
            }
        } else {
            const leftHip = results.poseLandmarks[23];
            const rightHip = results.poseLandmarks[24];
            if (leftHip && rightHip) {
                const tilt = (rightHip.y - leftHip.y) * 5;
                this.targetYaw += tilt * 0.02;
            }
        }
    }

    moveCharacter() {
        if (!this.character || !this.terrain) return;

        this.character.position.x += this.velocity.x;
        this.character.position.z += this.velocity.z;

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
            animal.position.x += (Math.random() - 0.5) * 0.1;
            animal.position.z += (Math.random() - 0.5) * 0.1;
            animal.position.x = Math.max(-25, Math.min(25, animal.position.x));
            this.character.position.z = Math.max(-25, Math.min(25, this.character.position.z));

            const height = this.getTerrainHeight(this.character.position.x, this.character.position.z);
            this.character.position.y = height + 0.9;

            this.camera.position.set(
                this.character.position.x,
                this.character.position.y + 5,
                this.character.position.z + 10
            );
            this.camera.lookAt(this.character.position);
        });
    }

    getTerrainHeight(x, z) {
            if(!this.terrain) return 0;

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

        // Land terrain (<div>) unless aquatic
        if (!data.isAquatic) {
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
        } else {
            this.terrain = null;
        }

        // Water terrain (<table> or aquatic)
        const waterSize = data.isAquatic ? 50 : 10;
        const waterGeometry = new THREE.PlaneGeometry(waterSize, waterSize, 32, 32);
        const waterVertices = waterGeometry.attributes.position.array;
        for (let i = 2; i < waterVertices.length; i += 3) {
            waterVertices[i] = Math.sin(i * data.waterComplexity / 50 + performance.now() * 0.001) * 0.5 - 1;
        }
        waterGeometry.attributes.position.needsUpdate = true;
        const waterColor = data.isAquatic ? 0x3399ff : 0x0000ff;
        const waterMaterial = new THREE.MeshBasicMaterial({ color: waterColor, opacity: 0.5, transparent: true });
        this.water = new THREE.Mesh(waterGeometry, waterMaterial);
        this.water.rotation.x = -Math.PI / 2;
        if (!data.isAquatic) {
            this.water.position.set((Math.random() - 0.5) * 30, 0, (Math.random() - 0.5) * 30);
        }
        this.scene.add(this.water);

        // Resources (<img>): Blue cubes
        const resourceGeometry = new THREE.BoxGeometry(1, 1, 1);
        const resourceMaterial = new THREE.MeshBasicMaterial({ color: 0x0000ff });
        for (let i = 0; i < data.resources; i++) {
            const resource = new THREE.Mesh(resourceGeometry, resourceMaterial);
            const x = data.isAquatic ? (Math.random() * 50 - 25) : (Math.random() * 40 - 20);
            const z = data.isAquatic ? (Math.random() * 50 - 25) : (Math.random() * 40 - 20);
            resource.position.set(
                x,
                (data.isAquatic ? -0.5 : this.getTerrainHeight(x, z)) + 0.5,
                z
            );
            this.scene.add(resource);
        }

        // Enemies (<script>): Red spheres
        const enemyGeometry = new THREE.SphereGeometry(0.5, 16, 16);
        const enemyMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        for (let i = 0; i < data.enemies; i++) {
            const enemy = new THREE.Mesh(enemyGeometry, enemyMaterial);
            const x = data.isAquatic ? (Math.random() * 50 - 25) : (Math.random() * 40 - 20);
            const z = data.isAquatic ? (Math.random() * 50 - 25) : (Math.random() * 40 - 20);
            enemy.position.set(
                x,
                (data.isAquatic ? -0.5 : this.getTerrainHeight(x, z)) + 0.5,
                z
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
            const typeIndex = data.isAquatic ? 1 : Math.min(Math.floor(data.animalTypeFactor / 50), 2);
            const animalDef = animalTypes[typeIndex] || animalTypes[0];
            const animal = new THREE.Mesh(animalDef.geometry, animalDef.material);
            const x = data.isAquatic ? (Math.random() * 50 - 25) : (Math.random() * 40 - 20);
            const z = data.isAquatic ? (Math.random() * 50 - 25) : (Math.random() * 40 - 20);
            animal.position.set(
                x,
                (data.isAquatic ? -0.5 : this.getTerrainHeight(x, z)) + animalDef.height,
                z
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
            const x = data.isAquatic ? (Math.random() * 50 - 25) : (Math.random() * 40 - 20);
            const z = data.isAquatic ? (Math.random() * 50 - 25) : (Math.random() * 40 - 20);
            structure.position.set(
                x,
                (data.isAquatic ? -0.5 : this.getTerrainHeight(x, z)) + 1,
                z
            );
            this.scene.add(structure);
        }

        // Interactables (<span>): Gray spheres
        const interactableMaterial = new THREE.MeshBasicMaterial({ color: 0xaaaaaa });
        for (let i = 0; i < data.interactables; i++) {
            const interactable = new THREE.Mesh(enemyGeometry, interactableMaterial);
            const x = data.isAquatic ? (Math.random() * 50 - 25) : (Math.random() * 40 - 20);
            const z = data.isAquatic ? (Math.random() * 50 - 25) : (Math.random() * 40 - 20);
            interactable.position.set(
                x,
                (data.isAquatic ? -0.5 : this.getTerrainHeight(x, z)) + 0.5,
                z
            );
            this.scene.add(interactable);
        }

        // Vegetation (<form>): Green cones (trees)
        const vegetationGeometry = new THREE.ConeGeometry(0.5, 2, 16);
        const vegetationMaterial = new THREE.MeshBasicMaterial({ color: 0x008800 });
        for (let i = 0; i < data.vegetation; i++) {
            const tree = new THREE.Mesh(vegetationGeometry, vegetationMaterial);
            const x = data.isAquatic ? (Math.random() * 50 - 25) : (Math.random() * 40 - 20);
            const z = data.isAquatic ? (Math.random() * 50 - 25) : (Math.random() * 40 - 20);
            tree.position.set(
                x,
                (data.isAquatic ? -0.5 : this.getTerrainHeight(x, z)) + 1,
                z
            );
            this.scene.add(tree);
        }

        // Hazards (<input>): Red spikes (cones)
        const hazardGeometry = new THREE.ConeGeometry(0.3, 1, 16);
        const hazardMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        for (let i = 0; i < data.hazards; i++) {
            const hazard = new THREE.Mesh(hazardGeometry, hazardMaterial);
            const x = data.isAquatic ? (Math.random() * 50 - 25) : (Math.random() * 40 - 20);
            const z = data.isAquatic ? (Math.random() * 50 - 25) : (Math.random() * 40 - 20);
            hazard.position.set(
                x,
                (data.isAquatic ? -0.5 : this.getTerrainHeight(x, z)) + 0.5,
                z
            );
            this.scene.add(hazard);
        }

        // Atmosphere (<meta>): Fog
        this.scene.fog = new THREE.Fog(0x000000, 10, 50 - data.atmosphere * 2);

        // Character with direction rectangle
        if (this.character) this.scene.remove(this.character);
        const characterGeometry = new THREE.CylinderGeometry(0.3, 0.3, 1.8, 16);
        const characterMaterial = new THREE.MeshBasic onBasicMaterial({ color: 0x00ff00 });
        this.character = new THREE.Mesh(characterGeometry, characterMaterial);

        // Add blue rectangle for direction
        const directionGeometry = new THREE.BoxGeometry(0.4, 0.1, 0.2);
        const directionMaterial = new THREE.MeshBasicMaterial({ color: 0x0000ff });
        const directionRectangle = new THREE.Mesh(directionGeometry, directionMaterial);
        directionRectangle.position.set(0, 0.8, 0.3); // Top, slightly forward
        this.character.add(directionRectangle);

        this.character.position.set(0, (data.isAquatic ? -0.5 : this.getTerrainHeight(0, 0)) + 0.9, 0);
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

        // Smooth character movement and turning
        if (this.character) {
            const now = performance.now();
            const decay = Math.exp(-(now - this.lastStep) / 500);
            this.velocity.multiplyScalar(decay);
            this.moveCharacter();

            this.characterYaw = THREE.MathUtils.lerp(this.characterYaw, this.targetYaw, 0.1);
            this.character.rotation.y = -this.characterYaw;
        }

        // Keyboard controls
        if (!this.useMotion) {
            const speed = 0.2;
            if (this.keys.ArrowUp) {
                this.velocity.set(
                    Math.sin(this.characterYaw) * speed,
                    0,
                    Math.cos(this.characterYaw) * speed
                );
                this.lastStep = performance.now();
            }
            if (this.keys.ArrowLeft) this.targetYaw += 0.05;
            if (this.keys.ArrowRight) this.targetYaw -= 0.05;
        }

        this.renderer.render(this.scene, this.camera);
    }
}
