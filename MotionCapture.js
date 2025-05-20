// MotionCapture.js: Handle motion tracking and wireframe rendering
class MotionCapture {
    constructor(player) {
        this.player = player;
        this.useMotion = false;
        this.useShoulders = true;
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

        // Wireframe canvas
        this.wireframeCanvas = document.getElementById('wireframeCanvas');
        this.wireframeCtx = this.wireframeCanvas.getContext('2d');
    }

    async setupMotionTracking() {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            this.cameras = devices.filter(device => device.kind === 'videoinput');
            console.log('Available cameras:', this.cameras.map(d => d.label || 'Unnamed'));
            const preferredCamera = this.cameras.find(c => c.label.includes('HP Wide Vision HD Camera')) || this.cameras[0];
            this.currentCameraIndex = this.cameras.indexOf(preferredCamera);
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
                    document.getElementById('wireframeCanvas').style.display = 'none';
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
        }
        this.motionInitialized = false;
        this.wireframeCtx.clearRect(0, 0, this.wireframeCanvas.width, this.wireframeCanvas.height);
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

        // Draw wireframe
        this.wireframeCtx.clearRect(0, 0, this.wireframeCanvas.width, this.wireframeCanvas.height);
        this.wireframeCtx.strokeStyle = 'cyan';
        this.wireframeCtx.lineWidth = 2;
        const canvasWidth = this.wireframeCanvas.width;
        const canvasHeight = this.wireframeCanvas.height;

        const drawLine = (landmark1, landmark2) => {
            if (landmark1 && landmark2) {
                this.wireframeCtx.beginPath();
                this.wireframeCtx.moveTo(landmark1.x * canvasWidth, landmark1.y * canvasHeight);
                this.wireframeCtx.lineTo(landmark2.x * canvasWidth, landmark2.y * canvasHeight);
                this.wireframeCtx.stroke();
            }
        };

        const landmarks = results.poseLandmarks;
        drawLine(landmarks[11], landmarks[12]); // Left shoulder to right shoulder
        drawLine(landmarks[23], landmarks[24]); // Left hip to right hip
        drawLine(landmarks[11], landmarks[23]); // Left shoulder to left hip
        drawLine(landmarks[12], landmarks[24]); // Right shoulder to right hip
        drawLine(landmarks[23], landmarks[25]); // Left hip to left knee
        drawLine(landmarks[24], landmarks[26]); // Right hip to right knee
        drawLine(landmarks[11], landmarks[13]); // Left shoulder to left elbow
        drawLine(landmarks[12], landmarks[14]); // Right shoulder to right elbow
        drawLine(landmarks[13], landmarks[15]); // Left elbow to left wrist
        drawLine(landmarks[14], landmarks[16]); // Right elbow to right wrist

        // Walking detection
        const leftKnee = landmarks[25];
        const rightKnee = landmarks[26];
        const leftHip = landmarks[23];
        const rightHip = landmarks[24];

        if (leftKnee && rightKnee && leftHip && rightHip) {
            const leftKneeHeight = leftKnee.y - leftHip.y;
            const rightKneeHeight = rightKnee.y - rightHip.y;
            const kneeThreshold = -0.05;

            const now = performance.now();
            if (leftKneeHeight < kneeThreshold && !this.leftKneeUp && now - this.lastStepTime > this.stepCooldown) {
                this.leftKneeUp = true;
                this.lastStep = now;
                this.player.velocity.set(
                    Math.sin(this.player.characterYaw) * this.player.characterSpeed,
                    0,
                    Math.cos(this.player.characterYaw) * this.player.characterSpeed
                );
                this.lastStepTime = now;
            } else if (rightKneeHeight < kneeThreshold && !this.rightKneeUp && now - this.lastStepTime > this.stepCooldown) {
                this.rightKneeUp = true;
                this.lastStep = now;
                this.player.velocity.set(
                    Math.sin(this.player.characterYaw) * this.player.characterSpeed,
                    0,
                    Math.cos(this.player.characterYaw) * this.player.characterSpeed
                );
                this.lastStepTime = now;
            }
            if (leftKneeHeight >= kneeThreshold) this.leftKneeUp = false;
            if (rightKneeHeight >= kneeThreshold) this.rightKneeUp = false;
        }

        // Turning detection
        if (this.useShoulders) {
            const leftShoulder = landmarks[11];
            const rightShoulder = landmarks[12];
            if (leftShoulder && rightShoulder) {
                const tilt = (leftShoulder.y - rightShoulder.y) * 5;
                this.player.targetYaw += tilt * 0.02;
            }
        } else {
            const leftHip = landmarks[23];
            const rightHip = landmarks[24];
            if (leftHip && rightHip) {
                const tilt = (rightHip.y - leftHip.y) * 5;
                this.player.targetYaw += tilt * 0.02;
            }
        }

        // Pass pose data for punch detection
        this.player.handlePunch({ landmarks }, this.getTerrainHeight.bind(this));
    }

    getTerrainHeight(x, z) {
        const terrain = this.player.scene.children.find(child => child.geometry instanceof THREE.PlaneGeometry && child.material.wireframe);
        if (!terrain) return 0;

        const geometry = terrain.geometry;
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
}