
```
https://www.easports.com/iframe/fifa17proclubs/api/platforms/PS4/clubsComplete/RELEVANT%20AGENCY

https://www.easports.com/iframe/fifa17proclubs/api/platforms/PS4/clubs/3634186/members

https://www.easports.com/iframe/fifa17proclubs/api/platforms/PS4/clubs/3634186/membersComplete

https://www.easports.com/iframe/fifa17proclubs/api/platforms/PS4/clubs/3634186/members/oLkiRkChWAQ-PT_bQQLp0w!!:rc9qZ9NrtlWaWbl3Ui_03w!!/stats?filters=pretty

https://www.easports.com/iframe/fifa17proclubs/api/platforms/PS4/members/aPMwB1F3_pWbX1UbUQBQYA!!:DuBDnoGLeFnxywP3x2jFAg!!/stats?filters=pretty

https://www.easports.com/iframe/fifa17proclubs/api/platforms/PS4/clubs/3634186/matches

https://www.easports.com/iframe/fifa17proclubs/api/platforms/PS4/settings
```


```
curl -vvv -X POST -H "Content-Type: application/json" http://localhost:3000/crawl --data '{"clubId": "3876559"}'

curl -vvv -X POST -H "Content-Type: application/json" http://localhost:3000/stats --data @'data.json'

curl -vvv -X POST -H "Content-Type: application/json" http://localhost:3000/patch --data '{"clubId": "3634186"}'

curl -vvv -X POST -H "Content-Type: application/json" http://localhost:3000/patch2 --data '{"playername": "surfacepro4"}'
```

```
curl -vvv -X POST -H "Content-Type: application/json" https://c26f28stbd.execute-api.ap-northeast-1.amazonaws.com/dev/crawl --data '{"clubId": "3634186"}'

curl -vvv -X POST -H "Content-Type: application/json" https://c26f28stbd.execute-api.ap-northeast-1.amazonaws.com/dev/stats --data @'data.json'
```
