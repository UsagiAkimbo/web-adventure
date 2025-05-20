// PlayerProfile.js: Manage player movement profile, TensorFlow model, and XP
class PlayerProfile {
    constructor() {
        this.profile = {
            baselineShoulderDistance: 0.2,
            punchVelocityThreshold: 0.5, // Increased sensitivity
            punchElbowAngleThreshold: 20, // Increased sensitivity
            walkingCadence: 0.5,
            lastUpdated: Date.now()
        };
        this.samples = {
            shoulderDistances: [],
            punchVelocities: [],
            punchElbowAngles: [],
            walkingCadences: []
        };
        this.tutorialState = null;
        this.tutorialSteps = [
            { action: 'walk', count: 10, message: 'Walk in place 10 times to calibrate movement.', complete: false },
            { action: 'turn', count: 10, मुक्तता: 'Twist your torso left and right 10 times to calibrate turning.', complete: false },
            { action: 'punch', count: 10, message: 'Throw 10 forward punches toward the blue cube to calibrate punching.', complete: false }
        ];
        this.tutorialCounts = { walk: 0, turn: 0, punch: 0 };

        // XP and Levels
        this.experience = {
            walk: { xp: 0, level: 1 },
            punch: { xp: 0, level: 1 },
            mine: { xp: 0, level: 1 }
        };
        this.levelThresholds = [0, 100, 250, 500, 1000, 2000]; // XP needed per level

        // Walking distance tracking
        this.totalSteps = 0;
        this.stepLength = 0.7; // Meters per step
        this.milesThreshold = 1; // Miles for XP award

        // Custom TensorFlow model
        this.model = null;
        this.modelTrainingData = {
            walk: [],
            punch: [],
            mine: []
        };

        this.loadProfile();
        this.initModel();
    }

    async initModel() {
        try {
            const model = tf.sequential();
            model.add(tf.layers.dense({ units: 64, inputShape: [3], activation: 'relu' }));
            model.add(tf.layers.dense({ units: 32, activation: 'relu' }));
            model.add(tf.layers.dense({ units: 3, activation: 'softmax' })); // 3 actions: walk, punch, mine
            model.compile({
                optimizer: tf.train.adam(0.001),
                loss: 'categoricalCrossentropy',
                metrics: ['accuracy']
            });
            this.model = model;
            console.log('Custom TensorFlow model initialized');
            await this.loadModel();
        } catch (error) {
            console.error('Error initializing model:', error.message);
        }
    }

    async trainModel(action, data, label) {
        if (!this.model) return;
        try {
            const xs = tf.tensor2d(data, [data.length, 3]); // [velocity, angle, shoulderDistance]
            const ys = tf.tensor2d(label, [label.length, 3]); // One-hot encoded: [walk, punch, mine]
            await this.model.fit(xs, ys, {
                epochs: 10,
                batchSize: 32,
                callbacks: {
                    onEpochEnd: (epoch, logs) => {
                        console.log(`Training ${action}: Epoch ${epoch}, Accuracy: ${logs.acc.toFixed(4)}`);
                        this.experience[action].xp += 5; // 5 XP per epoch
                        this.updateLevel(action);
                    }
                }
            });
            xs.dispose();
            ys.dispose();
            await this.saveModel();
            console.log(`Model trained for ${action}`);
        } catch (error) {
            console.error(`Error training model for ${action}:`, error.message);
        }
    }

    async saveModel() {
        try {
            const modelJson = await this.model.toJSON();
            localStorage.setItem('customModel', JSON.stringify(modelJson));
            console.log('Custom model saved');
        } catch (error) {
            console.error('Error saving model:', error.message);
        }
    }

    async loadModel() {
        try {
            const modelJson = localStorage.getItem('customModel');
            if (modelJson) {
                this.model = await tf.loadLayersModel(tf.io.fromMemory(JSON.parse(modelJson)));
                console.log('Custom model loaded');
            }
        } catch (error) {
            console.error('Error loading model:', error.message);
        }
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
                this.samples[sampleKey].shift();
            }
            this.updateProfile();
        }

        // Record for model training
        if (type === 'walk') {
            this.modelTrainingData.walk.push([value, 0, this.baselineShoulderDistance]);
            this.trainModel('walk', this.modelTrainingData.walk, Array(this.modelTrainingData.walk.length).fill([1, 0, 0]));
        } else if (type === 'punchVelocity') {
            this.modelTrainingData.punch.push([value, this.samples.punchElbowAngles[this.samples.punchElbowAngles.length - 1] || 20, this.baselineShoulderDistance]);
            this.trainModel('punch', this.modelTrainingData.punch, Array(this.modelTrainingData.punch.length).fill([0, 1, 0]));
        }
    }

    recordAction(action, xp) {
        if (!this.experience[action]) return;
        this.experience[action].xp += xp;
        this.updateLevel(action);
        console.log(`Gained ${xp} XP for ${action}. Total: ${this.experience[action].xp}, Level: ${this.experience[action].level}`);
        if (action === 'walk') {
            this.totalSteps++;
            const miles = (this.totalSteps * this.stepLength) / 1609.34;
            if (miles >= this.milesThreshold) {
                this.experience.walk.xp += 50; // Bonus XP for 1 mile
                this.updateLevel('walk');
                console.log(`Walked ${this.milesThreshold} miles! Gained 50 XP.`);
                this.totalSteps = 0; // Reset for next mile
            }
        }
    }

    updateLevel(action) {
        const xp = this.experience[action].xp;
        let level = 1;
        for (let i = 1; i < this.levelThresholds.length; i++) {
            if (xp >= this.levelThresholds[i]) {
                level = i + 1;
            } else {
                break;
            }
        }
        if (level > this.experience[action].level) {
            this.experience[action].level = level;
            console.log(`${action} leveled up to Level ${level}!`);
        }
    }

    async updateProfile() {
        try {
            const features = {};
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
            updateFeature(features.punchVelocities, 'punchVelocityThreshold', 0.5);
            updateFeature(features.punchElbowAngles, 'punchElbowAngleThreshold', 20);
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
        localStorage.setItem('playerExperience', JSON.stringify(this.experience));
        localStorage.setItem('totalSteps', this.totalSteps.toString());
    }

    loadProfile() {
        const savedProfile = localStorage.getItem('playerProfile');
        if (savedProfile) {
            this.profile = JSON.parse(savedProfile);
            console.log('Profile loaded:', this.profile);
        }
        const savedExperience = localStorage.getItem('playerExperience');
        if (savedExperience) {
            this.experience = JSON.parse(savedExperience);
            console.log('Experience loaded:', this.experience);
        }
        const savedSteps = localStorage.getItem('totalSteps');
        if (savedSteps) {
            this.totalSteps = parseInt(savedSteps);
            console.log('Steps loaded:', this.totalSteps);
        }
    }
}