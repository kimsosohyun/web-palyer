# 播放器组件使用

## 将文件夹拷贝至项目代码目录

```
|—— player  
    |    index.js // 主文件，音视频播放及解码器整合
    |—— audio
    |       pcm_player.js // 音频播放器AudioContext
    |—— video
            libffmpeg_tenda.js // 解码器，webassembly胶水文件
            libffmpeg_tenda.js.mem // 解码器相关
            libffmpeg_tenda.wasm // 解码器相关
            libffmpeg_tenda.worker.js // 解码器相关
            webgl.js // yuv视频格式渲染器
```

注：构建打包后，以libffmpeg_tenda命名的4个文件必须在同一文件夹下，否则会运行失败

## 标签按顺序引入

```javascript
<script src="./[打包目录下]/libffmpeg_tenda.js"></script>
<script src="./[打包目录下]/pcm_player.js"></script>
<script src="./[打包目录下]/webgl.js"></script>
<script src="./[打包目录下]/index.js"></script>
```

index内部调用了前三个js文件提供的变量及方法，所以必须先引入前三个js文件后才能引入index文件

## vue组件使用

基于标签引入的index暴露出的播放器构造函数封装vue组件

#### 基本使用
```html
/* template */
<Player ref="player" />

/* html */
// 初始化播放器配置
const cfgs = {
    id, // 播放器唯一标识，一般传入通道号
    canvas, // canvas DOM节点，用于逐帧播放画面
    wsAddr, // websocket地址
    isEnableAudio // 是否支持音频播放
};

// 建立websocket请求后，拉流所需要的参数，即接口参数
const args = {
    playType: "live",
    control: "start",
    channel: 0,
    streamType: "main"
};

// playerVm = this.$refs.player
// initPlayer返回的是一个Promise对象
// 状态为“fullfilled”的值有`true`(初始化成功)/`false`(初始化失败)
const inited = await playerVm.initPlayer(cfgs);
// 初始化成功
if (inited) {
    // 与服务器建立ws连接，等待连接成功后，发送args参数拉取相应的流
    playerVm.play(args);
}
```

## initPlayer内部实现

```javascript
async initPlayer(cfgs) {
    this.cfgs = cfgs;
    // 播放器实例化
    this.player = new Player({
        ...cfgs,
        canvas: this.$refs.canvas,
        wsAddr: this.wsAddr
    });

    // 等待播放器实例初始化
    this.isInited = await this.player.init();

    // 修改该播放器状态
    if (this.isInited) {
        this.status = STATUS.inited;
    } else {
        this.status = STATUS.error;
        console.error("init player video or audio decoder failed");
    }

    // fullfilled状态下返回的值
    return this.isInited;
}
```

传入播放器初始化所需要的配置，`id`唯一标识/通道号，`canvas`渲染画面的画布dom节点，`wsAddr`拉流服务器地址；等待初始化执行完成，根据初始化的状态设置播放器的状态并返回该状态


## play内部实现

```javascript
async play(args) {
    if (this.isInited) {
        try {
            // 初始化完成，建立ws连接
            const isConnected = await this.player.startConnect();

            if (isConnected) {
                // 连接成功，发送通道参数获取音视频流数据
                this.status = STATUS.playing;
                this.player.sendWSMessage(args);
            }
        } catch (e) {
            // websocket建立连接失败
            this.status = STATUS.error;
            console.error("websocket connect failed");
        }
    } else {
        console.log("video/audio decoder not ready");
    }
}
```

初始化完成后，使用初始化传入的wsAddr建立与服务器的长连接，连接成功后发送通道参数获取相对应的流数据


## stop内部实现

```javascript
stop(isClear) {
    const { inited, playing, paused, pending } = STATUS;

    if (this.status === playing || this.status === inited) {
        // 断开ws连接
        this.player.stopConnect();
    }

    // 修改状态为“暂停”
    this.status = paused;

    // 拿到webgl播放器
    const { webglPlayer } = this.player || {};
    const gl = webglPlayer && webglPlayer.gl;
    if (isClear) {
        this.status = pending;
        if (gl) {
            // 如果传入true，则清空canvas内容
            gl.clear(gl.COLOR_BUFFER_BIT);
        }
    }
}
```

仅在播放状态或初始化状态断开连接，并修改播放器的状态为“暂停”；如果`isClear`传入`true`，则代表停止播放(清空画布内容并修改状态)，不传或传`false`，代表暂停播放(画布内容保留)


## 流程图

### 解码及播放原理
```
graph TD
A("通道0原始流") --> E
B("通道1原始流") --> E
C("...") --> E
D("通道n原始流") --> E
E("解码器") --> F("0: yuv流")
E --> G("1: yuv流")
E --> H("...")
E --> I("n: yuv流")
F --> J
G --> J
H --> J
I --> J
J["逐帧渲染到画布"]
```



### 基本使用
```
graph TD
A[引入资源] --> B("初始化播放器：initPlayer(cfgs)")
    B --> C{条件inited}
    C --> |true| D["建立连接并拉流渲染：play(args)"]
    C --> |false| E[结束]
```


### initPlayer

```
graph TD
A["initPlayer(cfgs)"] --> B("js播放器实例化：player = new Player(cfgs)")
    B --> C("js播放器初始化：player.init()")
    C --> D{条件isInited}
    D --> |true| E("修改播放器状态为`isInited`")
    D --> |false| F("打印错误并修改播放器状态为`error`")
    E --> G["返回对象`Promise: {<fullfilled>: isInited}`"]
    F --> G
```


### play

```
graph TD
A["播放器初始化完成"] --> B("建立ws连接：player.startConnect()")
    B --> C{"ws连接状态"}
    C --> |成功| D["设置`播放`状态，发送参数拉取流数据"]
    C --> |失败| E["设置`失败`状态"]
```