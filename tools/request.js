const fs = require('fs');
const https = require('https');

const input = process.argv[2];

async function work() {
    const usernames = fs.readFileSync(input, {encoding: 'utf8'}).split("\n");
    for(const username of usernames) {
        await new Promise((resolve, reject) => {
            console.log("Requesting", username);
            https.request(`https://mzrcrqisa7.execute-api.us-east-2.amazonaws.com/PROD/opinions/${username}`, {
                method: 'POST',
            }, (data) => {
                resolve();
            }).end();
        });
    }
}
work().then(() => {console.log("done")});