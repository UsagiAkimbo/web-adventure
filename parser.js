// parser.js: Parse HTML and map tags to game environment elements
async function parseHTML(url) {
    try {
        // Ensure cheerio is defined (loaded from CDN)
        if (typeof cheerio === 'undefined') {
            throw new Error('Cheerio not loaded');
        }

        // Fetch HTML from the provided URL
        const response = await fetch(url, { mode: 'cors' });
        const html = await response.text();

        // Load Cheerio
        const $ = cheerio.load(html);

        // Count tags and map to game elements
        const tagCounts = {
            div: $('div').length,
            img: $('img').length,
            script: $('script').length,
            a: $('a').length,
            ul: $('ul').length,
            span: $('span').length,
            style: $('style').length,
            p: $('p').length,
            meta: $('meta').length,
            heading: $('h1,h2,h3,h4,h5,h6').length
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