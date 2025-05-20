// PlayerProfile.js: Manage player movement profile, TensorFlow model, and XP
class PlayerProfile {
    constructor() {
        this.profile = {
            baselineShoulderDistance: 0.2,
            punchVelocityThreshold: 0.5,
            punchElbowAngleThreshold: 20,
            walkingCadence: 0.5,
            lastUpdated: Date.now()
        };
        this.samples = {
            shoulderDistances: [],
            punchVelocities: [],
            punchElbowAngles: [],
            walkingCadences: [],
            miningSamples: [],
            spinningSamples: []
        };
        this.tutorialState = null;
        this.tutorialSteps = [
            { action: 'walk', count: 10, message: 'Walk in place 10 times to calibrate movement.', complete: false },
            { action: 'turn', count: 10, message: 'Twist your torso left and right 10 times to calibrate turning.', complete: false },
            { action: 'punch', count: 10, message: 'Throw 10 forward punches toward the blue cube to calibrate punching.', complete: false }
        ];
        this.tutorialCounts = { walk: 0, turn: 0, punch: 0 };
        this.xp = {
            walking: { xp: 0, level: 1 },
            combat: { xp: 0, level: 1 },
            mining: { xp: 0, level: 1 },
            exploration: { xp: 0, level: 1 }
        };
        this.model = null;
        this.trainingData = { inputs: [], labels: [] };
        this.isTraining = false;
        this.trainingQueue = [];
        this.lastTrainTime = 0;

        this.loadProfile();
        this.initModel();
        console.log('PlayerProfile initialized with methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(this)));
    }

    initModel() {
        this.model = tf.sequential();
        this.model.add(tf.layers.dense({ units: 64, activation: 'relu', inputShape: [5] }));
        this.model.add(tf.layers.dense({ units: 32, activation: 'relu' }));
        this.model.add(tf.layers.dense({ units: 3, activation: 'softmax' }));
        this.model.compile({
            optimizer: 'adam',
            loss: 'categoricalCrossentropy',
            metrics: ['accuracy']
        });
        console.log('Custom TensorFlow model initialized');
    }

    async trainModel() {
        if (this.trainingData.inputs.length < 10) {
            this.trainingQueue = [];
            return;
        }
        if (this.isTraining) {
            this.trainingQueue.push(true);
            return;
        }

        this.isTraining = true;
        try {
            const inputs = tf.tensor2d(this.trainingData.inputs, [this.trainingData.inputs.length, 5]);
            const labels = tf.tensor2d(this.trainingData.labels, [this.trainingData.labels.length, 3]);
            await this.model.fit(inputs, labels, {
                epochs: 10,
                batchSize: 32,
                callbacks: {
                    onEpochEnd: (epoch, logs) => {
                        console.log(`Training epoch ${epoch + 1}: accuracy = ${logs.acc.toFixed(4)}`);
                        this.awardXP('training', logs.acc * 10);
                    }
                }
            });
            inputs.dispose();
            labels.dispose();
            this.saveModel();
        } catch (error) {
            console.error('Error training model:', error.message);
        } finally {
            this.isTraining = false;
            if (this.trainingQueue.length > 0) {
                this.trainingQueue.shift();
                this.trainModel();
            }
        }
    }

    saveModel() {
        const modelData = JSON.stringify(this.model.toJSON());
        localStorage.setItem('playerModel', modelData);
        localStorage.setItem('trainingData', JSON.stringify(this.trainingData));
        console.log('Model saved');
    }

    loadModel() {
        const modelData = localStorage.getItem('playerModel');
        const trainingData = localStorage.getItem('trainingData');
        if (modelData) {
            this.model = tf.modelFromJSON(JSON.parse(modelData));
            this.model.compile({
                optimizer: 'adam',
                loss: 'categoricalCrossentropy',
                metrics: ['accuracy']
            });
            console.log('Model loaded');
        }
        if (trainingData) {
            this.trainingData = JSON.parse(trainingData);
        }
    }

    startTutorial() {
        this.tutorialState = 'active';
        this.tutorialCounts = { walk: 0, turn: 0, punch: 0 };
        this.tutorialSteps.forEach(step => step.complete = false);
        this.updateTutorialInstructions();
        console.log('Tutorial started');
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
        const validTypes = ['shoulderDistance', 'walk', 'turn', 'punchVelocity', 'punchElbowAngle', 'mining', 'spinning'];
        if (!validTypes.includes(type)) {
            console.warn(`Invalid sample type: ${type}`);
            return;
        }
        const sampleKey = type === 'shoulderDistance' ? 'shoulderDistances' :
            type === 'walk' ? 'walkingCadences' :
                type === 'turn' ? 'shoulderDistances' :
                    type === 'punchVelocity' ? 'punchVelocities' :
                        type === 'punchElbowAngle' ? 'punchElbowAngles' : type + 'Samples';
        this.samples[sampleKey].push(value);
        if (this.samples[sampleKey].length > 100) {
            this.samples[sampleKey].shift();
        }

        const input = [
            this.samples.shoulderDistances.slice(-1)[0] || 0,
            this.samples.punchVelocities.slice(-1)[0] || 0,
            this.samples.punchElbowAngles.slice(-1)[0] || 0,
            this.samples.walkingCadences.slice(-1)[0] || 0,
            validTypes.indexOf(type)
        ];
        const label = type === 'walk' ? [1, 0, 0] :
            type.includes('punch') ? [0, 1, 0] :
                type === 'mining' ? [0, 0, 1] : [0, 0, 0];
        this.trainingData.inputs.push(input);
        this.trainingData.labels.push(label);
        if (this.trainingData.inputs.length > 1000) {
            this.trainingData.inputs.shift();
            this.trainingData.labels.shift();
        }

        const now = performance.now();
        if (now - this.lastTrainTime > 5000) {
            this.lastTrainTime = now;
            this.trainModel();
        }

        if (this.tutorialState === 'active') {
            const step = this.tutorialSteps.find(s => s.action === type);
            if (step && !step.complete) {
                this.tutorialCounts[type]++;
                if (this.tutorialCounts[type] >= step.count) {
                    step.complete = true;
                }
                this.updateTutorialInstructions();
            }
        } else {
            this.updateProfile();
        }
    }

    awardXP(type, amount) {
        const xpTypes = ['walking', 'combat', 'mining', 'exploration', 'training'];
        if (!xpTypes.includes(type)) {
            console.warn(`Invalid XP type: ${type}`);
            return;
        }
        this.xp[type] = this.xp[type] || { xp: 0, level: 1 };
        this.xp[type].xp += amount;
        const levelThreshold = 100 * this.xp[type].level;
        if (this.xp[type].xp >= levelThreshold) {
            this.xp[type].level++;
            this.xp[type].xp -= levelThreshold;
            console.log(`Level up! ${type} level ${this.xp[type].level}`);
            this.trainModel();
        }
        this.saveProfile();
        this.updateXPDisplay();
    }

    updateXPDisplay() {
        const xpDisplay = document.getElementById('xpDisplay');
        if (xpDisplay) {
            xpDisplay.textContent = `Walking: L${this.xp.walking.level} (${this.xp.walking.xp}/100) | Combat: L${this.xp.combat.level} (${this.xp.combat.xp}/100) | Mining: L${this.xp.mining.level} (${this.xp.mining.xp}/100) | Exploration: L${this.xp.exploration.level} (${this.xp.exploration.xp}/100)`;
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
        localStorage.setItem('playerXP', JSON.stringify(this.xp));
    }

    loadProfile() {
        const saved = localStorage.getItem('playerProfile');
        const savedXP = localStorage.getItem('playerXP');
        if (saved) {
            this.profile = JSON.parse(saved);
            console.log('Profile loaded:', this.profile);
        }
        if (savedXP) {
            this.xp = JSON.parse(savedXP);
            console.log('XP loaded:', this.xp);
        }
        this.loadModel();
        this.updateXPDisplay();
    }
}