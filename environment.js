// environment.js: Generate Three.js environment from parsed HTML data
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

        // Controls (arrow keys for now)
        this.keys = { ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false };
        window.addEventListener('keydown', (e) => this.keys[e.key] = true);
        window.addEventListener('keyup', (e) => this.keys[e.key] = false);

        this.animate();
    }

    generate(data) {
        // Clear previous scene objects
        while (this.scene.children.length > 2) { // Keep lights
            this.scene.remove(this.scene.children[2]);
        }

        // Terrain: Plane with height variation
        const terrainGeometry = new THREE.PlaneGeometry(50, 50, 32, 32);
        const vertices = terrainGeometry.attributes.position.array;
        for (let i = 2; i < vertices.length; i += 3) {
            vertices[i] = Math.sin(i * data.terrainComplexity / 50) * 2; // Height based on div count
        }
        terrainGeometry.attributes.position.needsUpdate = true;
        const terrainMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: true });
        const terrain = new THREE.Mesh(terrainGeometry, terrainMaterial);
        terrain.rotation.x = -Math.PI / 2;
        this.scene.add(terrain);

        // Resources: Blue cubes
        const resourceGeometry = new THREE.BoxGeometry(1, 1, 1);
        const resourceMaterial = new THREE.MeshBasicMaterial({ color: 0x0000ff });
        for (let i = 0; i < data.resources; i++) {
            const resource = new THREE.Mesh(resourceGeometry, resourceMaterial);
            resource.position.set(
                Math.random() * 40 - 20,
                0.5,
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
                0.5,
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
                1,
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
                1,
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
                0.5,
                Math.random() * 40 - 20
            );
            this.scene.add(interactable);
        }

        // Atmosphere: Fog based on meta count
        this.scene.fog = new THREE.Fog(0x000000, 10, 50 - data.atmosphere * 2);

        // TODO: Add motion tracking (e.g., MediaPipe for arm swings to interact)
        // TODO: Add cryptocurrency rewards (e.g., log "0.0001 BTC" on resource click)
    }

    animate() {
        requestAnimationFrame(() => this.animate());

        // Basic movement (placeholder for motion tracking)
        const speed = 0.1;
        if (this.keys.ArrowUp) this.camera.position.z -= speed;
        if (this.keys.ArrowDown) this.camera.position.z += speed;
        if (this.keys.ArrowLeft) this.camera.position.x -= speed;
        if (this.keys.ArrowRight) this.camera.position.x += speed;

        this.renderer.render(this.scene, this.camera);
    }
}