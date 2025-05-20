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
            a: doc.querySelectorAll('a').length,
            ul: doc.querySelectorAll('ul').length,
            span: doc.querySelectorAll('span').length,
            style: doc.querySelectorAll('style').length,
            p: doc.querySelectorAll('p').length,
            meta: doc.querySelectorAll('meta').length,
            heading: doc.querySelectorAll('h1,h2,h3,h4,h5,h6').length
        };

        // Normalize counts for game balance
        return {
            terrainComplexity: Math.min(tagCounts.div, 50),
            resources: Math.min(tagCounts.img * 2, 20),
            enemies: Math.min(tagCounts.script, 10),
            npcs: Math.min(Math.floor(tagCounts.a / 5), 5),
            structures: Math.min(tagCounts.ul, 5),
            interactables: Math.min(tagCounts.span, 15),
            obstacles: Math.min(tagCounts.style, 5),
            paths: Math.min(tagCounts.p, 10),
            atmosphere: Math.min(tagCounts.meta, 10),
            collectibles: Math.min(tagCounts.heading, 5)
        };
    } catch (error) {
        console.error('Error parsing HTML:', error.message);
        // Return default values if parsing fails
        return {
            terrainComplexity: 10,
            resources: 5,
            enemies: 2,
            npcs: 1,
            structures: 1,
            interactables: 5,
            obstacles: 2,
            paths: 3,
            atmosphere: 5,
            collectibles: 1
        };
    }
}