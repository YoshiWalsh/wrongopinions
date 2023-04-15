A collection of scripts that are useful for testing wrongopinions.

## extract.js

Searches all files in a directory for MAL profile links, exports unique usernames to a file.

In order to gather a list of test users I went to various MAL clubs, forums, and review pages. I also went to a few threads on /r/anime, where many users have their MAL profiles displayed as flairs. I saved these pages into a folder and used `extract.js` to get all the usernames.

## request.js

Takes in a file of usernames and submits each one for processing.

## awards.js

Takes in a folder of the output JSON files from the server component. (These can be retrieved using `aws s3 sync s3://wrongopinions-mirror-bucket/completed .`)

Counts the number of times each award appears within these files.

The results are useful for tuning the criteria for when awards are given, as well as the interest values which govern when the awards are displayed.

## missing.js

Takes in a folder of output JSON files from the server component and a file of usernames. Looks for usernames which don't have a corresponding JSON file.

The results allow for identifying users which were not processed successfully.