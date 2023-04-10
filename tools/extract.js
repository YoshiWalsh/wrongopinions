const fs = require('fs');
const path = require('path');

const directory = process.argv[2];
const output = process.argv[3];
const files = fs.readdirSync(directory);
const usernames = {};
for(const file of files) {
    const absolutePath = path.resolve(directory, file);
    const contents = fs.readFileSync(absolutePath, {encoding: 'utf8'});
    const profiles = contents.match(/\/profile\/[A-Za-z0-9-_]{2,16}/g);
    if(!profiles) {
        continue;
    }
    for(const profile of profiles) {
        const username = profile.match(/\/profile\/([A-Za-z0-9-_]{2,16})/)[1].toLowerCase();
        if(!usernames[username]) {
            usernames[username] = username;
        }
    }
}
fs.writeFileSync(output, Object.keys(usernames).join("\n"));