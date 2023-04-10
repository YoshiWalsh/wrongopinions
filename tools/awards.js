const fs = require('fs');
const path = require('path');

const directory = process.argv[2];
const output = process.argv[3];
const files = fs.readdirSync(directory);
const awards = {};
for(const file of files) {
    const absolutePath = path.resolve(directory, file);
    const contents = fs.readFileSync(absolutePath, {encoding: 'utf8'});
    const data = JSON.parse(contents);
    for(const award of data.specialAwards) {
        awards[award.name] = (awards[award.name] ?? 0) + 1;
    }
}
fs.writeFileSync(output, JSON.stringify(awards));