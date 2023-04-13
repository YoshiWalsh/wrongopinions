const fs = require('fs');
const path = require('path');

const directory = process.argv[2];
const usernamesFile = process.argv[3];
const output = process.argv[4];
const files = fs.readdirSync(directory);
const processedUsernames = {};
for(const file of files) {
    const match = /completed-([a-z0-9_\-]{2,16})\.json/.exec(file);
    if(match) {
        processedUsernames[match[1]] = true;
    }
}
const usernames = fs.readFileSync(usernamesFile, {encoding: "utf8"}).split("\n");
const unprocessedUsernames = usernames.filter(u => !processedUsernames[u]);

fs.writeFileSync(output, unprocessedUsernames.join("\n"));