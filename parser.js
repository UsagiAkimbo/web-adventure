// parser.js: Parse HTML and map tags to game environment elements using DOMParser
async function parseHTML(url) {
    try {
        const response = await fetch(url, { mode: 'cors' });
        if (!response.ok) {
            throw new Error(`HTTP error: ${response.status}`);
        }
        const html = await response.text();

        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        const tagCounts = {
            div: doc.querySelectorAll('div').length,
            img: doc.querySelectorAll('img').length,
            script: doc.querySelectorAll('script').length,
            a: Array.from(doc.querySelectorAll('a')).map(a => ({
                count: 1,
                hrefLength: a.href ? a.href.length : 0,
                href: a.href
            })),
            ul: doc.querySelectorAll('ul').length,
            span: doc.querySelectorAll('span').length,
            style: doc.querySelectorAll('style').length,
            p: doc.querySelectorAll('p').length,
            meta: doc.querySelectorAll('meta').length,
            heading: doc.querySelectorAll('h1,h2,h3,h4,h5,h6').length,
            table: doc.querySelectorAll('table').length,
            form: doc.querySelectorAll('form').length,
            input: doc.querySelectorAll('input').length,
            iframe: doc.querySelectorAll('iframe').length,
            body: doc.querySelectorAll('body').length,
            html: doc.querySelectorAll('html').length,
            title: doc.querySelectorAll('title').length
        };

        const animalData = tagCounts.a.reduce((acc, a) => ({
            count: acc.count + a.count,
            totalHrefLength: acc.totalHrefLength + a.hrefLength
        }), { count: 0, totalHrefLength: 0 });

        // Portals: <a> tags with local .html href
        const portals = tagCounts.a
            .filter(a => a.href && a.href.endsWith('.html') && !a.href.startsWith('http'))
            .map(a => a.href.split('/').pop());

        if (url.endsWith('tutorial.html')) {
            return {
                terrainComplexity: Math.min(tagCounts.div, 10),
                waterComplexity: 0,
                isAquatic: false,
                resources: 1,
                enemies: 0,
                animals: 0,
                animalTypeFactor: 0,
                structures: 0,
                interactables: 0,
                obstacles: 0,
                paths: 0,
                atmosphere: Math.min(tagCounts.meta, 5),
                collectibles: 0,
                vegetation: 0,
                hazards: 0,
                portals,
                terrainColor: 0x00ff00, // Green for tutorial
                skyColor: 0x000000, // Black sky
                lighting: 0.5 // Default lighting
            };
        }

        // Beach environment for test_beach.html
        if (url.endsWith('test_beach.html')) {
            return {
                terrainComplexity: Math.min(tagCounts.div, 20),
                waterComplexity: Math.min(tagCounts.table, 30),
                isAquatic: tagCounts.iframe > 0,
                resources: Math.min(tagCounts.img * 2, 20),
                enemies: Math.min(tagCounts.script, 10),
                animals: Math.min(Math.floor(animalData.count / 5), 5),
                animalTypeFactor: animalData.totalHrefLength / Math.max(animalData.count, 1),
                structures: Math.min(tagCounts.ul, 5),
                interactables: Math.min(tagCounts.span, 15),
                obstacles: Math.min(tagCounts.style, 5),
                paths: Math.min(tagCounts.p, 10),
                atmosphere: Math.min(tagCounts.meta, 10),
                collectibles: Math.min(tagCounts.heading, 5),
                vegetation: Math.min(tagCounts.form, 10),
                hazards: Math.min(tagCounts.input, 10),
                portals,
                terrainColor: 0xffe4b5, // Sandy beige
                skyColor: 0x87ceeb, // Light blue sky
                lighting: 0.7 // Brighter lighting
            };
        }

        return {
            terrainComplexity: Math.min(tagCounts.div, 50),
            waterComplexity: Math.min(tagCounts.table, 20),
            isAquatic: tagCounts.iframe > 0,
            resources: Math.min(tagCounts.img * 2, 20),
            enemies: Math.min(tagCounts.script, 10),
            animals: Math.min(Math.floor(animalData.count / 5), 5),
            animalTypeFactor: animalData.totalHrefLength / Math.max(animalData.count, 1),
            structures: Math.min(tagCounts.ul, 5),
            interactables: Math.min(tagCounts.span, 15),
            obstacles: Math.min(tagCounts.style, 5),
            paths: Math.min(tagCounts.p, 10),
            atmosphere: Math.min(tagCounts.meta, 10),
            collectibles: Math.min(tagCounts.heading, 5),
            vegetation: Math.min(tagCounts.form, 10),
            hazards: Math.min(tagCounts.input, 10),
            portals,
            terrainColor: tagCounts.body > 0 ? 0x228b22 : 0x00ff00, // Forest green or default
            skyColor: tagCounts.html > 0 ? 0x4682b4 : 0x000000, // Steel blue or default
            lighting: Math.min(tagCounts.title, 5) * 0.1 + 0.5 // Title tags add brightness
        };
    } catch (error) {
        console.error('Error parsing HTML:', error.message);
        return {
            terrainComplexity: 10,
            waterComplexity: 5,
            isAquatic: false,
            resources: 5,
            enemies: 2,
            animals: 1,
            animalTypeFactor: 10,
            structures: 1,
            interactables: 5,
            obstacles: 2,
            paths: 3,
            atmosphere: 5,
            collectibles: 1,
            vegetation: 3,
            hazards: 2,
            portals: [],
            terrainColor: 0x00ff00,
            skyColor: 0x000000,
            lighting: 0.5
        };
    }
}