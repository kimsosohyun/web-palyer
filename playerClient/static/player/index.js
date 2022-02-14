(window => {
  /* 给后台提供码流测试使用 start */
  let mainStream = new Uint8Array();
  let audioStream = new Uint8Array();
  function mergeUint8Arrays(arr1, arr2) {
    const mergeArr = new Uint8Array(arr1.length + arr2.length);

    mergeArr.set(arr1);
    mergeArr.set(arr2, arr1.length);

    return mergeArr;
  }
  function mergeInt16Arrays(arr1, arr2) {
    const mergeArr = new Int16Array(arr1.length + arr2.length);

    mergeArr.set(arr1);
    mergeArr.set(arr2, arr1.length);

    return mergeArr;
  }
  /* 给后台提供码流测试使用 end */

  /**
   * 将Int16转换为PCMPlayer可播放的Float32格式
   * @param {Object} data - Int16Array格式数据
   * @returns 
   */
  function int16ToFloat32(data) {
    let inputSamples = data.length;
    let result = new Float32Array(inputSamples);
    for (let i = 0; i != inputSamples; ++i) {
      result[i] = data[i] / 32768;
    }
    return result;
  }
  function isFunction(variable) {
    return typeof variable === "function";
  }
  /**
   * 获取webassembly模块加载状态
   */
  function getModuleStatus() {
    return new Promise(resolve => {
      Module.onRuntimeInitialized = function() {
        resolve(true);
      }
    });
  }
  const isModuleLoaded = getModuleStatus();

  let pts = 0;

  /**
   * libffmpeg_tenda相关文件加载完成后，会在window上添加一个Module对象，用于操作解码器
   * Module提供以下几个函数，用于对音视频原始流的解码
   * 1.开启channel的解码功能
   *  Module._mediaDecoderOpen(channel, videoCb, audioCb)
   *    channel: 通道号
   *    videoCb: 视频解码回调，需要使用videoCb = Module.addFunction(fn)得到的返回值传入 为Module添加视频解码当前流后的回调
   *    audioCb: 音频解码回调，需要使用audioCb = Module.addFunction(fn)得到的返回值传入 为Module添加音频解码当前流后的回调
   * 2.发送原始音视频流
   *  Module._mediaSendStream(channel, streamPoint, size)
   * 3.关闭channel的解码功能
   *  Module._mediaDecoderClose(channel)
   * 
   * Decoder是基于Module提供的以上三个函数进行封装
   * 1.addPlayerInstance
   * 2.openDecoder
   * 3.decodeMediaStream
   * 4.closeDecoder
   */

   var arr = [];
   num = 0;
  class Decoder {
    videoCallback = null;
    audioCallback = null;
    playerInstances = {
      // channel: playerInst
    };
    constructor() { }
    // 添加播放器实例
    addPlayerInstance(instance) {
      this.playerInstances[instance.channel] = instance; //把player的实例存下来
    }
    // 开启channel的解码功能
    async openDecoder(channel) {
      const videoCb = this.getVideoCallback(),
        audioCb = this.getAudioCallback();
      await Module._mediaDecoderOpen(channel, videoCb, audioCb);

      return true;
    }

    // 对原始流进行解码
    decodeMediaStream(stream) {
      stream = new Uint8Array(stream);
      // mainStream = mergeUint8Arrays(mainStream, stream);
      // console.time('c-decoder')
      let size = stream.length;
      let cacheBuffer = Module._malloc(size); //创建空间，指针
      Module.HEAPU8.set(stream, cacheBuffer); //把流放到指针中
      // totalSize += size;
      // console.log("[web] sending stream", `channel: ${this.channel}, streamLen: ${size}`);
      Module._mediaSendStream(this.channel, cacheBuffer, size);
      if (cacheBuffer != null) { 
        //libffmpeg_tenda.wasm 存放流的地方，空间有限
        //推一次流就清一次，每次都需要释放空间
        Module._free(cacheBuffer); 
        cacheBuffer = null;
      }
    }
    // 关闭channel的解码功能
    closeDecoder(channel) {
      const playerInst = this.playerInstances[channel] || {};

      Module._mediaDecoderClose(channel);

      playerInst.pcmPlayer && playerInst.pcmPlayer.close();
      delete this.playerInstances[channel];
    }
    getVideoCallback() {
      const _this = this;
      if (this.videoCallback === null) {
        this.videoCallback = Module.addFunction(function (
          //整个函数作为视频解码当前流后的回调传入Module中
          channel,
          addr_y,
          addr_u,
          addr_v,
          stride_y,
          stride_u,
          stride_v,
          width,
          height,
          pts,
          dateTime
        ) {
          // console.timeEnd('c-decoder')
          // console.time('decoder')

          let size =
            width * height + (width / 2) * (height / 2) + (width / 2) * (height / 2);

          // console.log(arguments);
          let data = new Uint8Array(size);
          let pos = 0;
          for (let i = 0; i < height; i++) {
            let src = addr_y + i * stride_y;
            let tmp = HEAPU8.subarray(src, src + width);
            tmp = new Uint8Array(tmp);
            data.set(tmp, pos);
            pos += tmp.length;
          }
          for (let i = 0; i < height / 2; i++) {
            let src = addr_u + i * stride_u;
            let tmp = HEAPU8.subarray(src, src + width / 2);
            tmp = new Uint8Array(tmp);
            data.set(tmp, pos);
            pos += tmp.length;
          }
          for (let i = 0; i < height / 2; i++) {
            let src = addr_v + i * stride_v;
            let tmp = HEAPU8.subarray(src, src + width / 2);
            tmp = new Uint8Array(tmp);
            data.set(tmp, pos);
            pos += tmp.length;
          }
          let obj = {
            data: data,
            width,
            height,
            pts,
            dateTime
          };
          // console.timeEnd('decoder')
          const playerInst = _this.playerInstances[channel];
          playerInst.displayVideoFrame.call(playerInst, obj); //解码得到可用流后调用当前实例对应的player类中的播放方法，并指定this朝向为player的实例
        });
      }

      return this.videoCallback;
    }
    getAudioCallback() {
      const _this = this;
      if (this.audioCallback === null) {
        this.audioCallback = Module.addFunction(function (
          channel,
          data,
          samplesNum,
          SampleFormat,
          sampleRate,
          channels,
          pts,
          dateTime
        ) {
          // debugger
          const sampleSize = Module._AudioGetBytesPerSample(SampleFormat),
            len = samplesNum * sampleSize * channels / 2;
          let tmp = HEAPU8.subarray(data, data + len);
          let pcm16bitData = new Int16Array(tmp.buffer, tmp.byteOffset, tmp.byteLength);
          let pcmFloat32Data = int16ToFloat32(pcm16bitData);
          // audioStream = mergeUint8Arrays(audioStream, tmp);

          const obj = {
            data: pcmFloat32Data,
            channels,
            sampleRate,
            pts,
            dateTime
          }
          const playerInst = _this.playerInstances[channel];
          playerInst.displayAudioFrame.call(playerInst, obj);
        });
      }
      return this.audioCallback;
    }
  }

  class Player {
    ws = null; //ws地址
    webglPlayer = null;  //视频播放实例

    // 音频
    volume = 0;
    pcmPlayer = null; //音频播放实例

    constructor({
      id,
      canvas,
      wsAddr = null,
      isEnableAudio = true,
      beforeVideoFrameRender,
      afterVideoFrameRendered,
      beforeAudioFramePlay,
      afterAudioFramePlayed,
      afterPullStreamFailed
    }) {
      this.id = id;
      this.channel = id;
      this.canvas = canvas;
      this.wsAddr = wsAddr;
      this.isEnableAudio = isEnableAudio;
      this.beforeVideoFrameRender = beforeVideoFrameRender;
      this.afterVideoFrameRendered = afterVideoFrameRendered;
      this.beforeAudioFramePlay = beforeAudioFramePlay;
      this.afterAudioFramePlayed = afterAudioFramePlayed;
      this.afterPullStreamFailed = afterPullStreamFailed;
    }
    async init() {
      // 将实例传进解码器中，待后续播放音视频使用
      decoder.addPlayerInstance(this);
      // 等待Module加载完成，并在解码器中开启该播放器对应通道的权限
      const isInited = await isModuleLoaded && await decoder.openDecoder(this.channel);

      return isInited;
    }

    // 播放视频帧
    displayVideoFrame(obj) {
      console.log(this)

      const {
        data,
        width,
        height,
        pts,
        dateTime
      } = obj;
      const yLength = width * height;
      const uvLength = (width / 2) * (height / 2);
      isFunction(this.beforeVideoFrameRender) && this.beforeVideoFrameRender({ width, height, pts, dateTime });
      if (!this.webglPlayer) {
        this.webglPlayer = new WebGLPlayer(this.canvas, {
          preserveDrawingBuffer: true
        });
      }
      this.webglPlayer.renderFrame(data, width, height, yLength, uvLength);
      isFunction(this.afterVideoFrameRendered) && this.afterVideoFrameRendered({ width, height, pts, dateTime });
    }
    // 播放音频
    displayAudioFrame(obj) {
      if (!this.isEnableAudio) {
        return;
      }
      const {
        data,
        channels,
        sampleRate,
        pts,
        dateTime
      } = obj;
      let pcmPlayer = this.pcmPlayer;
      isFunction(this.beforeAudioFramePlay) && this.beforeAudioFramePlay({ channels, sampleRate, pts, dateTime });
      if (!pcmPlayer) {
        pcmPlayer = this.pcmPlayer = new PCMPlayer(channels, sampleRate); // pcm播放器
        pcmPlayer.setVolume(this.volume);
      }
      pcmPlayer.feed(data);
      isFunction(this.afterAudioFramePlayed) && this.afterAudioFramePlayed({ channels, sampleRate, pts, dateTime });
    }

    // 建立websocket连接
    startConnect() {
      return new Promise((resolve, reject) => {
        this.ws = new WebSocket(this.wsAddr);

        // 1.绑定open事件
        this.ws.addEventListener("open", () => {
          // 建立连接成功，设置接收数据格式为'arraybuffer'
          this.ws.binaryType = "arraybuffer";
          resolve(true);
        });

        // 2.绑定message事件
        this.ws.addEventListener("message", async event => {
          let msg = event.data;

          if (typeof msg === "string") {
            // 判断首次返回的消息 { result: true/false }
            try {
              msg = JSON.parse(msg);
              if (!msg.result) {
                // 返回false，断开与服务器的ws连接
                this.stopConnect();
                // 触发钩子函数
                isFunction(this.afterPullStreamFailed) && this.afterPullStreamFailed();
              }
            } catch (e) {
              // 返回的数据格式有误，断开与服务器的ws连接
              this.stopConnect();
            }
            return;
          }

          // 数据正常，对原始流进行解码
          decoder.decodeMediaStream.call(this, msg);
        });

        // 3.绑定失败事件
        this.ws.addEventListener("error", e => {
          reject(e);
        });
      });
    }

    // 建立ws连接后发送数据
    sendWSMessage(msg) {
      this.ws.send(JSON.stringify(msg));
    }

    // 断开连接
    stopConnect() {
      if (this.ws) {
        this.ws.close();
      }

      decoder.closeDecoder(this.channel);
    }

  }

  const decoder = new Decoder();
  window.Player = Player;
})(window);