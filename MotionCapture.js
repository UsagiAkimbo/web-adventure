// MotionCapture.js: Handle motion tracking with MediaPipe, TensorFlow.js, and OpenCV.js
class MotionCapture {
    constructor(player, profile) {
        this.player = player;
        this.profile = profile;
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
        this.wireframeCtx = this.wireframeCanvas.getContext('2d', { willReadFrequently: true }); // Optimize for getImageData

        // MediaPipe and MoveNet
        this.mpPose = null;
        this.tfDetector = null;
        this.camera = null;

        // OpenCV
        this.srcMat = null;
        this.dstMat = null;

        // Smoothing
        this.smoothedLandmarks = Array(33).fill(null).map(() => ({ x: 0, y: 0, z: 0 }));
        this.smoothingFactor = 0.7;

        // Shoulder distance tracking
        this.baselineShoulderDistance = this.profile.profile.baselineShoulderDistance;
        this.distanceSamples = [];
        this.sampleCount = 10;
        this.distanceThreshold = 0.9; // 10% reduction to turn
        this.profileThreshold = 0.5; // 50% reduction for profile stance
        this.lastLeftShoulderX = 0;
        this.lastRightShoulderX = 0;

        // Walking fallback
        this.lastLeftHipY = 0;
        this.lastRightHipY = 0;
        this.hipOscillationCount = 0;
        this.lastHipStepTime = 0;

        this.setupMotionTracking();
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

        // Initialize MediaPipe
        try {
            this.mpPose = new Pose({
                locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
            });
            this.mpPose.setOptions({
                modelComplexity: 1,
                smoothLandmarks: true,
                minDetectionConfidence: 0.5,
                minTrackingConfidence: 0.5
            });
            this.mpPose.onResults((results) => this.onMediaPipeResults(results));
            console.log('MediaPipe Pose initialized');
        } catch (error) {
            console.error('Error initializing MediaPipe:', error.message);
            this.mpPose = null;
        }

        // Initialize MoveNet
        try {
            this.tfDetector = await poseDetection.createDetector(poseDetection.SupportedModels.MoveNet, {
                modelType: 'SinglePose.Thunder'
            });
            console.log('MoveNet detector initialized');
        } catch (error) {
            console.error('Error initializing MoveNet:', error.message);
            this.tfDetector = null;
        }

        if (!this.mpPose && !this.tfDetector) {
            console.error('Both MediaPipe and MoveNet failed to initialize. Motion tracking disabled.');
            document.getElementById('poseStatus').textContent = 'Pose detection failed';
        }
    }

    async startMotionTracking() {
        if (this.motionInitialized || (!this.mpPose && !this.tfDetector)) return;
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

                // Initialize OpenCV matrices
                this.srcMat = new cv.Mat(this.videoElement.videoHeight, this.videoElement.videoWidth, cv.CV_8UC4);
                this.dstMat = new cv.Mat(this.videoElement.videoHeight, this.videoElement.videoWidth, cv.CV_8UC1);

                console.log('Webcam stream started:', stream.active, 'Camera:', this.cameras[this.currentCameraIndex]?.label || 'Default');
                document.getElementById('videoStatus').textContent = `Camera: ${this.cameras[this.currentCameraIndex]?.label || 'Default'}`;
                localStorage.setItem('preferredCameraId', this.cameras[this.currentCameraIndex]?.deviceId || '');

                this.motionInitialized = true;
                document.getElementById('motionStatus').textContent = 'Webcam active';
                document.getElementById('poseStatus').textContent = 'Pose detection active';

                // Start MediaPipe camera
                if (this.mpPose) {
                    this.camera = new Camera(this.videoElement, {
                        onFrame: async () => {
                            if (this.videoElement.videoWidth > 0 && this.videoElement.videoHeight > 0) {
                                await this.mpPose.send({ image: this.videoElement });
                            }
                        },
                        width: 640,
                        height: 480
                    });
                    this.camera.start();
                }

                // Start processing frames for MoveNet and OpenCV
                this.processFrames();
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
        if (this.camera) {
            this.camera.stop();
            this.camera = null;
        }
        this.motionInitialized = false;
        this.wireframeCtx.clearRect(0, 0, this.wireframeCanvas.width, this.wireframeCanvas.height);
        if (this.srcMat) this.srcMat.delete();
        if (this.dstMat) this.dstMat.delete();
        // Reset shoulder distance and walking tracking
        this.baselineShoulderDistance = this.profile.profile.baselineShoulderDistance;
        this.distanceSamples = [];
        this.hipOscillationCount = 0;
        this.lastHipStepTime = 0;
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

    onMediaPipeResults(results) {
        this.mpResults = results;
        this.combineResults();
    }

    async processFrames() {
        if (!this.motionInitialized || !this.useMotion) return;

        try {
            // Ensure valid video dimensions
            if (this.videoElement.videoWidth <= 0 || this.videoElement.videoHeight <= 0) {
                console.warn('Skipping frame processing: invalid video dimensions');
                requestAnimationFrame(() => this.processFrames());
                return;
            }

            // Draw video feed on canvas
            this.wireframeCtx.clearRect(0, 0, this.wireframeCanvas.width, this.wireframeCanvas.height);
            if (document.getElementById('videoToggle').checked) {
                this.wireframeCtx.drawImage(this.videoElement, 0, 0, this.wireframeCanvas.width, this.wireframeCanvas.height);
            }

            // Capture frame for processing
            const imageData = this.wireframeCtx.getImageData(0, 0, this.videoElement.videoWidth, this.videoElement.videoHeight);
            this.srcMat.data.set(imageData.data);

            // Preprocess with OpenCV
            cv.cvtColor(this.srcMat, this.dstMat, cv.COLOR_RGBA2GRAY);
            cv.equalizeHist(this.dstMat, this.dstMat);
            const processedMat = new cv.Mat();
            cv.cvtColor(this.dstMat, processedMat, cv.COLOR_GRAY2RGBA);
            const processedData = new Uint8ClampedArray(processedMat.data);
            const processedImageData = new ImageData(processedData, this.videoElement.videoWidth, this.videoElement.videoHeight);
            processedMat.delete();

            // Run MoveNet
            let tfPoses = [];
            if (this.tfDetector) {
                tfPoses = await this.tfDetector.estimatePoses(this.videoElement);
            }

            this.tfResults = tfPoses.length > 0 ? tfPoses[0] : null;
            this.combineResults();
        } catch (error) {
            console.error('Frame processing error:', error.message);
        }

        requestAnimationFrame(() => this.processFrames());
    }

    combineResults() {
        if (!this.mpResults && !this.tfResults) return;

        const now = performance.now(); // Single declaration of 'now'

        // Initialize landmarks
        const landmarks = Array(33).fill(null).map(() => ({ x: 0, y: 0, z: 0 }));

        // Map MoveNet keypoints to MediaPipe indices
        const keypointMap = {
            5: 11, // Left shoulder
            6: 12, // Right shoulder
            11: 23, // Left hip
            12: 24, // Right hip
            13: 25, // Left knee
            14: 26, // Right knee
            7: 13, // Left elbow
            8: 14, // Right elbow
            9: 15, // Left wrist
            10: 16 // Right wrist
        };

        // Blend MediaPipe and MoveNet keypoints
        if (this.mpResults && this.mpResults.poseLandmarks) {
            this.mpResults.poseLandmarks.forEach((kp, i) => {
                if (kp.visibility > 0.5) {
                    landmarks[i] = { x: kp.x, y: kp.y, z: kp.z };
                }
            });
        }

        if (this.tfResults && this.tfResults.keypoints) {
            this.tfResults.keypoints.forEach(kp => {
                const mappedIndex = keypointMap[kp.id];
                if (mappedIndex && kp.score > 0.5) {
                    const tfKp = {
                        x: kp.x / this.videoElement.videoWidth,
                        y: kp.y / this.videoElement.videoHeight,
                        z: kp.z || 0
                    };
                    if (landmarks[mappedIndex].x !== 0 || landmarks[mappedIndex].y !== 0) {
                        landmarks[mappedIndex].x = (landmarks[mappedIndex].x + tfKp.x) / 2;
                        landmarks[mappedIndex].y = (landmarks[mappedIndex].y + tfKp.y) / 2;
                        landmarks[mappedIndex].z = (landmarks[mappedIndex].z + tfKp.z) / 2;
                    } else {
                        landmarks[mappedIndex] = tfKp;
                    }
                }
            });
        }

        // Apply smoothing
        landmarks.forEach((kp, i) => {
            if (kp.x !== 0 || kp.y !== 0) {
                this.smoothedLandmarks[i].x = this.smoothingFactor * this.smoothedLandmarks[i].x + (1 - this.smoothingFactor) * kp.x;
                this.smoothedLandmarks[i].y = this.smoothingFactor * this.smoothedLandmarks[i].y + (1 - this.smoothingFactor) * kp.y;
                this.smoothedLandmarks[i].z = this.smoothingFactor * this.smoothedLandmarks[i].z + (1 - this.smoothingFactor) * kp.z;
            }
        });

        // Draw wireframe
        this.wireframeCtx.clearRect(0, 0, this.wireframeCanvas.width, this.wireframeCanvas.height);
        if (document.getElementById('videoToggle').checked) {
            this.wireframeCtx.drawImage(this.videoElement, 0, 0, this.wireframeCanvas.width, this.wireframeCanvas.height);
        }
        const canvasWidth = this.wireframeCanvas.width;
        const canvasHeight = this.wireframeCanvas.height;

        const drawLine = (landmark1, landmark2, color = 'cyan') => {
            if (landmark1 && landmark2 && (landmark1.x !== 0 || landmark1.y !== 0) && (landmark2.x !== 0 || landmark2.y !== 0)) {
                this.wireframeCtx.beginPath();
                this.wireframeCtx.strokeStyle = color;
                this.wireframeCtx.lineWidth = 2;
                this.wireframeCtx.moveTo(landmark1.x * canvasWidth, landmark1.y * canvasHeight);
                this.wireframeCtx.lineTo(landmark2.x * canvasWidth, landmark2.y * canvasHeight);
                this.wireframeCtx.stroke();
            }
        };

        drawLine(this.smoothedLandmarks[11], this.smoothedLandmarks[12], 'cyan');
        drawLine(this.smoothedLandmarks[23], this.smoothedLandmarks[24], 'white');
        drawLine(this.smoothedLandmarks[11], this.smoothedLandmarks[23], 'cyan');
        drawLine(this.smoothedLandmarks[12], this.smoothedLandmarks[24], 'cyan');
        drawLine(this.smoothedLandmarks[23], this.smoothedLandmarks[25], 'white');
        drawLine(this.smoothedLandmarks[24], this.smoothedLandmarks[26], 'white');
        drawLine(this.smoothedLandmarks[11], this.smoothedLandmarks[13], 'cyan');
        drawLine(this.smoothedLandmarks[12], this.smoothedLandmarks[14], 'cyan');
        drawLine(this.smoothedLandmarks[13], this.smoothedLandmarks[15], 'cyan');
        drawLine(this.smoothedLandmarks[14], this.smoothedLandmarks[16], 'cyan');

        // Walking detection (primary: knee-based, fallback: hip-based)
        const leftKnee = this.smoothedLandmarks[25];
        const rightKnee = this.smoothedLandmarks[26];
        const leftHip = this.smoothedLandmarks[23];
        const rightHip = this.smoothedLandmarks[24];

        if (leftKnee && rightKnee && leftHip && rightHip && (leftKnee.x !== 0 || leftKnee.y !== 0) && (rightKnee.x !== 0 || rightKnee.y !== 0)) {
            // Primary: knee-based walking
            const leftKneeHeight = leftKnee.y - leftHip.y;
            const rightKneeHeight = rightKnee.y - rightHip.y;
            const kneeThreshold = -0.05;

            if (leftKneeHeight < kneeThreshold && !this.leftKneeUp && now - this.lastStepTime > this.stepCooldown) {
                this.leftKneeUp = true;
                this.lastStep = now;
                this.player.velocity.set(
                    Math.sin(this.player.characterYaw) * this.player.characterSpeed,
                    0,
                    Math.cos(this.player.characterYaw) * this.player.characterSpeed
                );
                this.lastStepTime = now;
                this.profile.recordSample('walk', (now - this.lastHipStepTime) / 1000);
                this.lastHipStepTime = now;
            } else if (rightKneeHeight < kneeThreshold && !this.rightKneeUp && now - this.lastStepTime > this.stepCooldown) {
                this.rightKneeUp = true;
                this.lastStep = now;
                this.player.velocity.set(
                    Math.sin(this.player.characterYaw) * this.player.characterSpeed,
                    0,
                    Math.cos(this.player.characterYaw) * this.player.characterSpeed
                );
                this.lastStepTime = now;
                this.profile.recordSample('walk', (now - this.lastHipStepTime) / 1000);
                this.lastHipStepTime = now;
            }
            if (leftKneeHeight >= kneeThreshold) this.leftKneeUp = false;
            if (rightKneeHeight >= kneeThreshold) this.rightKneeUp = false;
        } else if (leftHip && rightHip && (leftHip.x !== 0 || leftHip.y !== 0) && (rightHip.x !== 0 || rightHip.y !== 0)) {
            // Fallback: hip-based walking
            const leftHipYDelta = leftHip.y - (this.lastLeftHipY || leftHip.y);
            const rightHipYDelta = rightHip.y - (this.lastRightHipY || rightHip.y);
            const hipThreshold = 0.02;

            if (leftHipYDelta > hipThreshold && !this.leftKneeUp && now - this.lastStepTime > this.stepCooldown) {
                this.leftKneeUp = true;
                this.lastStep = now;
                this.player.velocity.set(
                    Math.sin(this.player.characterYaw) * this.player.characterSpeed,
                    0,
                    Math.cos(this.player.characterYaw) * this.player.characterSpeed
                );
                this.lastStepTime = now;
                this.profile.recordSample('walk', (now - this.lastHipStepTime) / 1000);
                this.lastHipStepTime = now;
                this.hipOscillationCount++;
            } else if (rightHipYDelta > hipThreshold && !this.rightKneeUp && now - this.lastStepTime > this.stepCooldown) {
                this.rightKneeUp = true;
                this.lastStep = now;
                this.player.velocity.set(
                    Math.sin(this.player.characterYaw) * this.player.characterSpeed,
                    0,
                    Math.cos(this.player.characterYaw) * this.player.characterSpeed
                );
                this.lastStepTime = now;
                this.profile.recordSample('walk', (now - this.lastHipStepTime) / 1000);
                this.lastHipStepTime = now;
                this.hipOscillationCount++;
            }
            if (leftHipYDelta <= hipThreshold) this.leftKneeUp = false;
            if (rightHipYDelta <= hipThreshold) this.rightKneeUp = false;

            this.lastLeftHipY = leftHip.y;
            this.lastRightHipY = rightHip.y;
        }

        // Shoulder distance-based turning with clamping
        const leftShoulder = this.smoothedLandmarks[11];
        const rightShoulder = this.smoothedLandmarks[12];
        if (leftShoulder && rightShoulder && (leftShoulder.x !== 0 || leftShoulder.y !== 0) && (rightShoulder.x !== 0 || rightShoulder.y !== 0)) {
            // Calculate shoulder distance
            const distance = Math.sqrt(
                Math.pow(rightShoulder.x - leftShoulder.x, 2) +
                Math.pow(rightShoulder.y - leftShoulder.y, 2)
            );

            // Establish baseline distance
            if (this.distanceSamples.length < this.sampleCount) {
                this.distanceSamples.push(distance);
                if (this.distanceSamples.length === this.sampleCount) {
                    this.baselineShoulderDistance = this.distanceSamples.reduce((sum, d) => sum + d, 0) / this.sampleCount;
                    this.profile.profile.baselineShoulderDistance = this.baselineShoulderDistance;
                    this.profile.saveProfile();
                    console.log('Baseline shoulder distance set:', this.baselineShoulderDistance);
                }
            } else {
                // Detect turning
                const distanceRatio = distance / this.baselineShoulderDistance;
                if (this.useShoulders && distanceRatio < this.distanceThreshold) {
                    const leftShoulderXDelta = leftShoulder.x - (this.lastLeftShoulderX || leftShoulder.x);
                    const rightShoulderXDelta = rightShoulder.x - (this.lastRightShoulderX || rightShoulder.x);
                    const intensity = Math.min((1 - distanceRatio) * 2, 2); // Cap intensity at 2x

                    let rotationSpeed = 0;
                    if (Math.abs(leftShoulderXDelta) > Math.abs(rightShoulderXDelta) && leftShoulderXDelta > 0) {
                        // Left shoulder moves right, turn right
                        rotationSpeed = -intensity * 0.1;
                    } else if (Math.abs(rightShoulderXDelta) > Math.abs(leftShoulderXDelta) && rightShoulderXDelta < 0) {
                        // Right shoulder moves left, turn left
                        rotationSpeed = intensity * 0.1;
                    }

                    // Apply rotation with clamping
                    const initialYaw = Math.PI; // Facing away from camera
                    const maxYaw = Math.PI / 2; // 90° left or right
                    if (distanceRatio < this.profileThreshold) {
                        // Profile stance: allow full rotation to face camera (0° or 180°)
                        this.player.targetYaw += rotationSpeed;
                    } else {
                        // Clamp to ±90°
                        const newYaw = this.player.targetYaw + rotationSpeed;
                        this.player.targetYaw = Math.max(initialYaw - maxYaw, Math.min(initialYaw + maxYaw, newYaw));
                    }

                    this.profile.recordSample('turn', distance);
                }
            }

            this.lastLeftShoulderX = leftShoulder.x;
            this.lastRightShoulderX = rightShoulder.x;
            // Only record shoulder distance after baseline is set
            if (this.distanceSamples.length >= this.sampleCount) {
                this.profile.recordSample('shoulderDistance', distance);
            }
        }

        // Punch detection
        const leftWrist = this.smoothedLandmarks[15];
        const rightWrist = this.smoothedLandmarks[16];
        const leftElbow = this.smoothedLandmarks[13];
        const rightElbow = this.smoothedLandmarks[14];

        if (leftWrist && rightWrist && leftElbow && rightElbow && leftShoulder && rightShoulder && this.player.character) {
            // Map wrist positions to 3D
            const playerPos = this.player.character.position;
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
            if (this.player.leftHand) this.player.leftHand.position.copy(leftHandPos);
            if (this.player.rightHand) this.player.rightHand.position.copy(rightHandPos);

            // Detect punches
            let leftPunchVelocity = 0;
            let rightPunchVelocity = 0;
            let leftElbowAngle = 0;
            let rightElbowAngle = 0;

            const dt = (now - this.player.lastWristTime) / 1000;
            this.player.lastWristTime = now;

            if (this.player.lastLeftWristPos && dt > 0) {
                const delta = leftHandPos.clone().sub(this.player.lastLeftWristPos);
                const forwardDir = new THREE.Vector3(Math.sin(this.player.characterYaw), 0, Math.cos(this.player.characterYaw));
                leftPunchVelocity = delta.dot(forwardDir) / dt;

                // Calculate elbow angle
                const shoulderToElbow = new THREE.Vector3(
                    leftElbow.x - leftShoulder.x,
                    leftElbow.y - leftShoulder.y,
                    leftElbow.z - leftShoulder.z
                ).normalize();
                const elbowToWrist = new THREE.Vector3(
                    leftWrist.x - leftElbow.x,
                    leftWrist.y - leftElbow.y,
                    leftWrist.z - leftElbow.z
                ).normalize();
                leftElbowAngle = Math.acos(shoulderToElbow.dot(elbowToWrist)) * 180 / Math.PI;
            }

            if (this.player.lastRightWristPos && dt > 0) {
                const delta = rightHandPos.clone().sub(this.player.lastRightWristPos);
                const forwardDir = new THREE.Vector3(Math.sin(this.player.characterYaw), 0, Math.cos(this.player.characterYaw));
                rightPunchVelocity = delta.dot(forwardDir) / dt;

                const shoulderToElbow = new THREE.Vector3(
                    rightElbow.x - rightShoulder.x,
                    rightElbow.y - rightShoulder.y,
                    rightElbow.z - rightShoulder.z
                ).normalize();
                const elbowToWrist = new THREE.Vector3(
                    rightWrist.x - rightElbow.x,
                    rightWrist.y - rightElbow.y,
                    rightWrist.z - rightElbow.z
                ).normalize();
                rightElbowAngle = Math.acos(shoulderToElbow.dot(elbowToWrist)) * 180 / Math.PI;
            }

            this.player.lastLeftWristPos = leftHandPos.clone();
            this.player.lastRightWristPos = rightHandPos.clone();

            // Check for punches
            const punchRadius = 0.8;
            const distanceRatio = this.baselineShoulderDistance ? (Math.sqrt(
                Math.pow(rightShoulder.x - leftShoulder.x, 2) +
                Math.pow(rightShoulder.y - leftShoulder.y, 2)
            ) / this.baselineShoulderDistance) : 1;

            if (
                leftPunchVelocity > this.profile.profile.punchVelocityThreshold &&
                leftElbowAngle > this.profile.profile.punchElbowAngleThreshold &&
                distanceRatio < this.distanceThreshold
            ) {
                const handPos = leftHandPos;
                const handLabel = 'left';
                this.processPunch(handPos, handLabel, punchRadius);
                this.profile.recordSample('punchVelocity', leftPunchVelocity);
                this.profile.recordSample('punchElbowAngle', leftElbowAngle);
            } else if (
                rightPunchVelocity > this.profile.profile.punchVelocityThreshold &&
                rightElbowAngle > this.profile.profile.punchElbowAngleThreshold &&
                distanceRatio < this.distanceThreshold
            ) {
                const handPos = rightHandPos;
                const handLabel = 'right';
                this.processPunch(handPos, handLabel, punchRadius);
                this.profile.recordSample('punchVelocity', rightPunchVelocity);
                this.profile.recordSample('punchElbowAngle', rightElbowAngle);
            }
        }
    }

    processPunch(handPos, handLabel, punchRadius) {
        for (const resource of this.player.resources) {
            if (handPos.distanceTo(resource.position) < punchRadius) {
                console.log(`Punched resource with ${handLabel} hand at (${resource.position.x.toFixed(2)}, ${resource.position.y.toFixed(2)}, ${resource.position.z.toFixed(2)})!`);
            }
        }
        for (const enemy of this.player.enemies) {
            if (handPos.distanceTo(enemy.position) < punchRadius) {
                console.log(`Punched enemy with ${handLabel} hand at (${enemy.position.x.toFixed(2)}, ${enemy.position.y.toFixed(2)}, ${enemy.position.z.toFixed(2)})!`);
            }
        }
        for (const animal of this.player.animals) {
            if (handPos.distanceTo(animal.position) < punchRadius) {
                console.log(`Punched animal (${animal.userData.type}) with ${handLabel} hand at (${animal.position.x.toFixed(2)}, ${animal.position.y.toFixed(2)}, ${animal.position.z.toFixed(2)})!`);
            }
        }
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