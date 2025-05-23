// EnvironmentGeneration.js: Set up Three.js scene and generate environment objects
class EnvironmentGenerator {
    constructor(canvas) {
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ canvas });
        this.renderer.setSize(window.innerWidth, window.innerHeight);

        this.camera.position.set(0, 10, 20);
        this.camera.lookAt(0, 0, 0);

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambientLight);
        this.directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
        this.directionalLight.position.set(0, 10, 10);
        this.scene.add(this.directionalLight);

        this.terrain = null;
        this.water = null;
    }

    generate(data, player) {
        while (this.scene.children.length > 2) {
            this.scene.remove(this.scene.children[2]);
        }
        player.resources = [];
        player.enemies = [];
        player.animals = [];
        player.portals = [];

        this.scene.background = new THREE.Color(data.skyColor);

        if (!data.isAquatic) {
            const terrainGeometry = new THREE.PlaneGeometry(50, 50, 32, 32);
            const vertices = terrainGeometry.attributes.position.array;
            for (let i = 2; i < vertices.length; i += 3) {
                vertices[i] = Math.sin(i * data.terrainComplexity / 50) * 2;
            }
            terrainGeometry.attributes.position.needsUpdate = true;
            const terrainMaterial = new THREE.MeshBasicMaterial({ color: data.terrainColor, wireframe: true });
            this.terrain = new THREE.Mesh(terrainGeometry, terrainMaterial);
            this.terrain.rotation.x = -Math.PI / 2;
            this.scene.add(this.terrain);
        } else {
            this.terrain = null;
        }

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

        const resourceGeometry = new THREE.BoxGeometry(1, 1, 1);
        const resourceMaterial = new THREE.MeshBasicMaterial({ color: 0x0000ff });
        for (let i = 0; i < data.resources; i++) {
            const resource = new THREE.Mesh(resourceGeometry, resourceMaterial);
            const x = data.isAquatic ? (Math.random() * 50 - 25) : (Math.random() * 40 - 20);
            const z = data.isAquatic ? (Math.random() * 50 - 25) : (Math.random() * 40 - 20);
            resource.position.set(
                i === 0 && data.resources === 1 ? 0 : x,
                (data.isAquatic ? -0.5 : this.getTerrainHeight(x, z)) + 0.5,
                i === 0 && data.resources === 1 ? -5 : z
            );
            this.scene.add(resource);
            player.resources.push(resource);
        }

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
            player.enemies.push(enemy);
        }

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
            animal.userData = { height: animalDef.height, type: animalDef.type };
            this.scene.add(animal);
            player.animals.push(animal);
        }

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

        const portalGeometry = new THREE.CylinderGeometry(1, 1, 0.2, 32);
        const portalMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00, opacity: 0.7, transparent: true });
        for (let i = 0; i < data.portals.length; i++) {
            const portal = new THREE.Mesh(portalGeometry, portalMaterial);
            const x = data.isAquatic ? (Math.random() * 50 - 25) : (Math.random() * 40 - 20);
            const z = data.isAquatic ? (Math.random() * 50 - 25) : (Math.random() * 40 - 20);
            portal.position.set(
                x,
                (data.isAquatic ? -0.5 : this.getTerrainHeight(x, z)) + 0.1,
                z
            );
            portal.userData = { href: data.portals[i].href };
            this.scene.add(portal);
            player.portals.push(portal);
        }

        this.scene.fog = new THREE.Fog(0x000000, 10, 50 - data.atmosphere * 2);
        this.directionalLight.intensity = data.lighting;

        player.createPlayer(data.isAquatic ? -0.5 : this.getTerrainHeight(0, 0));
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
}