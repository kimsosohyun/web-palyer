const fs = require('fs');
const WebSocketServer = require('ws').Server,
  wss = new WebSocketServer({
    port: 1010
  });
let timer = null;

// 响应onmessage事件:
wss.onmessage = function (msg) {
  console.log(msg);
};

wss.on('connection', ws => {
  console.log('Client is connected');

  ws.on('message', data => {
    console.log(data.toString());
  });

  fs.readFile('./data.json', 'utf8', (err, data) => {
    if (err) return console.log(err);
    data = JSON.parse(data);
    let count = 1;

    if (!timer) {
      timer = setInterval(() => {
        if (ws.readyState === 3) { //表示连接已经关闭，或者打开连接失败。
          console.log("Client is closed")
          clearInterval(timer);
          timer = null;
        }
        if (count >= Object.keys(data).length) {
          count = 1;
        }
        ws.send(data[count]);
        count++;
      }, 100);
    }
  })
});