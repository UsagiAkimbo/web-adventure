// parser.js: Parse HTML and map tags to game environment elements using DOMParser
async function parseHTML(url) {
    try {
        // Fetch HTML from the provided URL
        const response = await fetch(url, { mode: 'cors' });
        if (!response.ok) {
            throw new Error(`HTTP error: ${response.status}`);
        }
        const html = await response.text();

        // Parse HTML with DOMParser
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        // Count tags using querySelectorAll
        const tagCounts = {
            div: doc.querySelectorAll('div').length,
            img: doc.querySelectorAll('img').length,
            script: doc.querySelectorAll('script').length,
            a: Array.from(doc.querySelectorAll('a')).map(a => ({
                count: 1,
                hrefLength: a.href ? a.href.length : 0
            })),
            ul: doc.querySelectorAll('ul').length,
            span: doc.querySelectorAll('span').length,
            style: doc.querySelectorAll('style').length,
            p: doc.querySelectorAll('p').length,
            meta: doc.querySelectorAll('meta').length,
            heading: doc.querySelectorAll('h1,h2,h3,h4,h5,h6').length,
            table: doc.querySelectorAll('table').length,
            form: doc.querySelectorAll('form').length,
            input: doc.querySelectorAll('input').length
        };

        // Normalize counts and process <a> tags for animals
        const animalData = tagCounts.a.reduce((acc, a) => ({
            count: acc.count + a.count,
            totalHrefLength: acc.totalHrefLength + a.hrefLength
        }), { count: 0, totalHrefLength: 0 });

        return {
            terrainComplexity: Math.min(tagCounts.div, 50), // Land terrain
            waterComplexity: Math.min(tagCounts.table, 20), // Water terrain
            resources: Math.min(tagCounts.img * 2, 20),
            enemies: Math.min(tagCounts.script, 10),
            animals: Math.min(Math.floor(animalData.count / 5), 5), // Animals from <a>
            animalTypeFactor: animalData.totalHrefLength / Math.max(animalData.count, 1), // For animal type
            structures: Math.min(tagCounts.ul, 5),
            interactables: Math.min(tagCounts.span, 15),
            obstacles: Math.min(tagCounts.style, 5),
            paths: Math.min(tagCounts.p, 10),
            atmosphere: Math.min(tagCounts.meta, 10),
            collectibles: Math.min(tagCounts.heading, 5),
            vegetation: Math.min(tagCounts.form, 10), // Trees from <form>
            hazards: Math.min(tagCounts.input, 10) // Spikes from <input>
        };
    } catch (error) {
        console.error('Error parsing HTML:', error.message);
        return {
            terrainComplexity: 10,
            waterComplexity: 5,
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
            hazards: 2
        };
    }
}