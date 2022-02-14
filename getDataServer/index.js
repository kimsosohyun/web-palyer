var WebSocket = require('ws')

var ws = new WebSocket('ws://192.168.1.254:9001');

var msg = {playType: 'live', control: 'start', channel: 1, streamType: 'extra'};

var fs = require('fs');


var obj = {},
num = 0;

ws.on('open', function () {
  console.log(`[CLIENT] open()`);
  ws.send(JSON.stringify(msg));
});

ws.on('message', function (message) {
  num++;
  console.log(`[CLIENT] Received: ${message}`);
  if(num > 1) {
    obj[num] = message;
  }else {
    obj[num] = message;
  }
    
  

  if(num >= 500) {
  
    ws.close();
    fs.writeFileSync("data.json", JSON.stringify(obj));
  }

});
