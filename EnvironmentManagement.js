// EnvironmentManagement.js: Manage dynamic environment updates
class EnvironmentManager {
    constructor(scene) {
        this.scene = scene;
        this.water = null;
        this.animals = [];
    }

    setWater(water) {
        this.water = water;
    }

    setAnimals(animals) {
        this.animals = animals;
    }

    update() {
        // Update water waves
        if (this.water) {
            const vertices = this.water.geometry.attributes.position.array;
            for (let i = 2; i < vertices.length; i += 3) {
                vertices[i] = Math.sin(i * 10 / 50 + performance.now() * 0.001) * 0.5 - 1;
            }
            this.water.geometry.attributes.position.needsUpdate = true;
        }

        // Update animals
        this.animals.forEach(animal => {
            animal.position.x += (Math.random() - 0.5) * 0.1;
            animal.position.z += (Math.random() - 0.5) * 0.1;
            animal.position.x = Math.max(-25, Math.min(25, animal.position.x));
            animal.position.z = Math.max(-25, Math.min(25, animal.position.z));
            animal.position.y = this.getTerrainHeight(animal.position.x, animal.position.z) + animal.userData.height;
        });
    }

    getTerrainHeight(x, z) {
        const terrain = this.scene.children.find(child => child.geometry instanceof THREE.PlaneGeometry && child.material.wireframe);
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