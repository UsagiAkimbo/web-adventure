// parser.js: Parse HTML and map tags to game environment elements
async function parseHTML(url) {
    try {
        // Fetch HTML from the provided URL
        const response = await fetch(url, { mode: 'cors' });
        const html = await response.text();

        // Load Cheerio (assumes CDN in index.html)
        const $ = cheerio.load(html);

        // Count tags and map to game elements
        const tagCounts = {
            div: $('div').length,        // Terrain complexity
            img: $('img').length,        // Resources (data crystals)
            script: $('script').length,  // Enemies (code beasts)
            a: $('a').length,            // NPCs (traders)
            ul: $('ul').length,          // Structures (marketplaces)
            span: $('span').length,      // Interactables (crafting nodes)
            style: $('style').length,    // Obstacles (walls)
            p: $('p').length,            // Paths
            meta: $('meta').length,      // Atmosphere (intensity)
            heading: $('h1,h2,h3,h4,h5,h6').length // Collectibles (artifacts)
        };

        // Normalize counts to reasonable ranges for game balance
        return {
            terrainComplexity: Math.min(tagCounts.div, 50), // Max 50 for terrain height
            resources: Math.min(tagCounts.img * 2, 20),     // 2 resources per img, max 20
            enemies: Math.min(tagCounts.script, 10),        // Max 10 enemies
            npcs: Math.min(Math.floor(tagCounts.a / 5), 5), // 1 NPC per 5 links, max 5
            structures: Math.min(tagCounts.ul, 5),          // Max 5 structures
            interactables: Math.min(tagCounts.span, 15),    // Max 15 interactables
            obstacles: Math.min(tagCounts.style, 5),        // Max 5 obstacles
            paths: Math.min(tagCounts.p, 10),               // Max 10 path segments
            atmosphere: Math.min(tagCounts.meta, 10),       // Atmosphere intensity (0-10)
            collectibles: Math.min(tagCounts.heading, 5)    // Max 5 collectibles
        };
    } catch (error) {
        console.error('Error parsing HTML:', error);
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