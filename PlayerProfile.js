// PlayerProfile.js: Manage player movement profile with TensorFlow.js and OpenCV.js
class PlayerProfile {
    constructor() {
        this.profile = {
            baselineShoulderDistance: 0.2, // Default, updated in tutorial
            punchVelocityThreshold: 0.7,
            punchElbowAngleThreshold: 30, // Degrees
            walkingCadence: 0.5, // Steps per second
            lastUpdated: Date.now()
        };
        // Initialize all sample arrays
        this.samples = {
            shoulderDistances: [],
            punchVelocities: [],
            punchElbowAngles: [],
            walkingCadences: []
        };
        this.tutorialState = null;
        this.tutorialSteps = [
            { action: 'walk', count: 10, message: 'Walk in place 10 times to calibrate movement.', complete: false },
            { action: 'turn', count: 10, message: 'Twist your torso left and right 10 times to calibrate turning.', complete: false },
            { action: 'punch', count: 10, message: 'Throw 10 forward punches toward the blue cube to calibrate punching.', complete: false }
        ];
        this.tutorialCounts = { walk: 0, turn: 0, punch: 0 };

        // Load existing profile
        this.loadProfile();
    }

    startTutorial() {
        this.tutorialState = 'active';
        this.tutorialCounts = { walk: 0, turn: 0, punch: 0 };
        this.tutorialSteps.forEach(step => step.complete = false);
        this.updateTutorialInstructions();
    }

    updateTutorialInstructions() {
        const currentStep = this.tutorialSteps.find(step => !step.complete);
        if (!currentStep) {
            document.getElementById('tutorialInstructions').style.display = 'none';
            this.tutorialState = null;
            this.updateProfile();
            return;
        }
        document.getElementById('tutorialInstructions').style.display = 'block';
        document.getElementById('tutorialInstructions').textContent = `${currentStep.message} (${this.tutorialCounts[currentStep.action]}/${currentStep.count})`;
    }

    recordSample(type, value) {
        // Validate type and ensure sample array exists
        const validTypes = ['shoulderDistance', 'walk', 'turn', 'punchVelocity', 'punchElbowAngle'];
        if (!validTypes.includes(type)) {
            console.warn(`Invalid sample type: ${type}`);
            return;
        }
        const sampleKey = type === 'shoulderDistance' ? 'shoulderDistances' :
            type === 'walk' ? 'walkingCadences' :
                type === 'turn' ? 'shoulderDistances' :
                    type === 'punchVelocity' ? 'punchVelocities' :
                        type === 'punchElbowAngle' ? 'punchElbowAngles' : null;
        if (!this.samples[sampleKey]) {
            console.error(`Sample array ${sampleKey} not initialized`);
            return;
        }

        if (this.tutorialState === 'active') {
            const step = this.tutorialSteps.find(s => s.action === type);
            if (step && !step.complete) {
                this.samples[sampleKey].push(value);
                this.tutorialCounts[type]++;
                if (this.tutorialCounts[type] >= step.count) {
                    step.complete = true;
                }
                this.updateTutorialInstructions();
            }
        } else {
            this.samples[sampleKey].push(value);
            if (this.samples[sampleKey].length > 100) {
                this.samples[sampleKey].shift(); // Keep last 100 samples
            }
            this.updateProfile();
        }
    }

    async updateProfile() {
        try {
            const features = {};
            // Only create tensors for non-empty sample arrays
            if (this.samples.shoulderDistances.length > 0) {
                features.shoulderDistances = tf.tensor2d(this.samples.shoulderDistances.map(d => [d]), [this.samples.shoulderDistances.length, 1]);
            }
            if (this.samples.punchVelocities.length > 0) {
                features.punchVelocities = tf.tensor2d(this.samples.punchVelocities.map(v => [v]), [this.samples.punchVelocities.length, 1]);
            }
            if (this.samples.punchElbowAngles.length > 0) {
                features.punchElbowAngles = tf.tensor2d(this.samples.punchElbowAngles.map(a => [a]), [this.samples.punchElbowAngles.length, 1]);
            }
            if (this.samples.walkingCadences.length > 0) {
                features.walkingCadences = tf.tensor2d(this.samples.walkingCadences.map(c => [c]), [this.samples.walkingCadences.length, 1]);
            }

            const updateFeature = (data, key, defaultValue) => {
                if (data) {
                    const mean = data.mean().dataSync()[0];
                    this.profile[key] = mean;
                    data.dispose();
                } else {
                    this.profile[key] = defaultValue;
                }
            };

            updateFeature(features.shoulderDistances, 'baselineShoulderDistance', 0.2);
            updateFeature(features.punchVelocities, 'punchVelocityThreshold', 0.7);
            updateFeature(features.punchElbowAngles, 'punchElbowAngleThreshold', 30);
            updateFeature(features.walkingCadences, 'walkingCadence', 0.5);

            this.profile.lastUpdated = Date.now();
            this.saveProfile();
            console.log('Profile updated:', this.profile);
        } catch (error) {
            console.error('Error updating profile:', error.message);
        }
    }

    saveProfile() {
        localStorage.setItem('playerProfile', JSON.stringify(this.profile));
    }

    loadProfile() {
        const saved = localStorage.getItem('playerProfile');
        if (saved) {
            this.profile = JSON.parse(saved);
            console.log('Profile loaded:', this.profile);
        }
    }
}