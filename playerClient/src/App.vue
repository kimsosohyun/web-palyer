<template>
<div>
  <Player :channel="channel" :playerStatus="status"/>
  <button  @click="changeStatus('play')">play</button>
  <button  @click="changeStatus('pause')">pause</button>
  <button  @click="changeStatus('stop')">stop</button>
</div>
</template>

<script>
import Player from "./components/Player"
export default {
  name: 'App',
  components: {
    Player
  },
  data() {
    return {
      status: "",
      channel: 0
    }
  },
  mounted() {

  },
  methods: {
    changeStatus(status) {
      this.status = status;
    }
  }
}
</script>

<style>

</style>
