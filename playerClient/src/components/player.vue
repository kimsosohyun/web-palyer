<template>
  <div class="player">
    <canvas ref="canvas" width="500" height="500"></canvas>
  </div>
</template>

<script>
const { Player } = window,
  STATUS = {
    pending: "pending", //断开ws连接，暂停播放，清空画布
    inited: "inited", //传入cfg new player() 初始化成功
    playing: "playing", //建立ws连接成功，开始获取流数据
    paused: "paused", //断开ws连接，暂停播放，但不清空画布
    error: "error" //传入cfg new player() 初始化失败
  },
  wdr = "ws://localhost:1010";

export default {
  data() {
    return {
      player: null,
      status: STATUS.pending,
      isInited: false
    };
  },
  props: {
    playerStatus: String,
    channel: Number
  },
  watch: {
    playerStatus(val) {
      switch (val) {
        case "play":
          this.startPlay();
          break;
        case "pause":
          this.pausePlay();
          break;
        case "stop":
          this.stopPlay();
          break;
      }
    }
  },
  mounted() {
    // this.initPlayer();
  },
  methods: {
    async initPlayer(cfgs) {
      this.cfgs = cfgs;
      // 播放器实例化
      this.player = new Player({
        ...cfgs,
        canvas: this.$refs.canvas,
        wsAddr: wdr
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
    },
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
    },
    setVolume(volume) {
      if (this.status !== STATUS.playing) {
        return;
      }

      const { pcmPlayer } = this.player;

      if (pcmPlayer) {
        pcmPlayer.setVolume(volume);
      } else {
        this.player.volume = volume;
      }
    },
    stop(isClear) {
      const { inited, playing, paused, pending } = STATUS;

      if (this.status === playing || this.status === inited) {
        this.player.stopConnect();
      }
      // this.flushDecoder();
      this.status = paused;

      const { webglPlayer } = this.player || {};
      const gl = webglPlayer && webglPlayer.gl;
      if (isClear) {
        this.status = pending;
        if (gl) {
          // 如果传入true，则清空canvas内容
          gl.clear(gl.COLOR_BUFFER_BIT);
        }
      }
    },
    async startPlay() {
      this.isInited = await this.initPlayer({ id: this.channel });

      console.log(this.isInited);

      if (!this.isInited) {
        console.error(_("Failed to live view"));
        this.stopPlay();
        return;
      }

      const args = { playType: "live", control: "start", channel: this.channel, streamType: "extra" };
      await this.play(args);
      this.setVolume(50);
    },
    pausePlay() {
      this.stop();
    },
    stopPlay() {
      this.stop(true);
    }
  }
};
</script>

<style>
canvas {
  background-color: #1b1d21;
}
</style>
