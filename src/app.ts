import { Client, LSTrack, MuteType, ConnectOption, SendingVideoOption, SDKErrorEvent, ErrorDetail, VideoCodecType, SendingPriority, SDKError } from "@ricoh-live-streaming-api/ricoh-ls-sdk";
import { Credential } from "./credential";

type QuerySelector = (param: string) => HTMLElement | null;
const $: QuerySelector = document.querySelector.bind(document);

let lsTracks: LSTrack[] = [];
let client: Client | null = null;

type DemoAppMeta = {
  name: string;
  hand: HandType;
  cameraName: string;
};

type HandType = "none" | "raise";

type ConnectionInfo = {
  connection_id: string;
  name?: string;
  audioMute?: MuteType;
  hand?: HandType;
  cameraName?: string;
  stability?: string;
};

let connections: ConnectionInfo[] = [];
let roomId = "";
let videoCodec: VideoCodecType = "h264";
let sendingPriority: SendingPriority = "normal";
let maxBitrateKbps = 0;
let receivingEnabled = true;
let iceServersProtocol: "all" | "udp" | "tcp" | "tls" | undefined = undefined;

function updateConnectionInfo(info: ConnectionInfo) {
  const displayText = (name?: string, audioMute?: MuteType, hand?: HandType, cameraName?: string, stability?: string): string => {
    let ret = "";
    if (stability !== "initial" && stability !== "stable") {
      const warning = stability === "unstable" ? "⚠" : "❌";
      ret = `${warning} `;
    }
    ret = `${name}`;
    if (cameraName && cameraName !== "") ret = `${ret} (${cameraName})`;
    if (audioMute === "unmute") ret = `${ret} 🔊`;
    else ret = `${ret} 🔇`;
    if (hand === "raise") ret = `${ret} ✋`;
    return ret;
  };
  connections.forEach((connection) => {
    if (connection.connection_id === info.connection_id) {
      if (info.name) connection.name = info.name;
      if (info.audioMute) connection.audioMute = info.audioMute;
      if (info.hand) connection.hand = info.hand;
      if (info.cameraName) connection.cameraName = info.cameraName;

      const $text = $(`#${info.connection_id}_text`) as HTMLDivElement;
      $text.innerText = displayText(connection.name, connection.audioMute, connection.hand, connection.cameraName);
    }
  });
}

let fullScreenConnection = "";

function onSDKError(e: ErrorDetail, errstr: string) {
  ($("#errMsg") as HTMLSpanElement).innerText = e.error;
  ($("#reportStr") as HTMLDivElement).innerText = errstr;

  ($("#error") as HTMLDivElement).style.display = "block";
  ($("#remoteStreams") as HTMLElement).innerHTML = "";
  ($("#localStream") as HTMLVideoElement).srcObject = null;
  ($("#main") as HTMLDivElement).style.display = "none";
}

function createClient(): Client {
  const client = new Client();

  client.on("error", (e: SDKErrorEvent) => {
    onSDKError(e.detail, e.toReportString());
  });
  client.on("open", (e) => {
    ($("#connect") as HTMLButtonElement).disabled = false;
    ($("#connect") as HTMLButtonElement).innerText = "disconnect";
  });
  client.on("close", (e) => {
    ($("#connect") as HTMLButtonElement).disabled = false;
    ($("#connect") as HTMLButtonElement).innerText = "connect";
  });
  client.on("addlocaltrack", ({ mediaStreamTrack, stream }) => {
    ($("#localStream") as HTMLVideoElement).srcObject = stream;
  });
  client.on("addremoteconnection", ({ connection_id, meta }) => {
    let $container = $(`#${connection_id}`) as HTMLDivElement;
    if ($container) return;

    $container = document.createElement("div");
    $container.id = connection_id;

    const $video = document.createElement("video");
    $video.id = `${connection_id}_video`;
    $video.setAttribute("playsinline", "");
    $video.ondblclick = () => {
      $video.requestFullscreen();
      fullScreenConnection = connection_id;
    };
    ($container as Node).appendChild($video);

    const $text = document.createElement("div");
    $text.id = `${connection_id}_text`;
    ($container as Node).appendChild($text);
    ($("#remoteStreams") as HTMLElement).appendChild($container);

    connections.push({
      connection_id,
      name: (meta as DemoAppMeta).name,
      audioMute: "unmute",
      hand: "none",
      cameraName: "",
      stability: "initial",
    });
  });

  client.on("updateremoteconnection", ({ connection_id, meta }) => {
    updateConnectionInfo({
      connection_id,
      hand: (meta as DemoAppMeta).hand,
    });
  });

  client.on("removeremoteconnection", ({ connection_id, meta, mediaStreamTrack }) => {
    let $container = $(`#${connection_id}`) as HTMLDivElement;
    if ($container) return;
    ($("#remoteStreams") as HTMLElement).removeChild($container);

    connections = connections.filter((connection) => connection.connection_id !== connection_id);
  });

  client.on("addremotetrack", async ({ connection_id, mediaStreamTrack, stream, mute }) => {
    const $video = $(`#${connection_id}_video`) as HTMLVideoElement;
    if (!$video) return;

    if ($video.srcObject) ($video.srcObject as MediaStream).addTrack(mediaStreamTrack);
    else $video.srcObject = stream;
    await $video.play();

    if (mediaStreamTrack.kind === "video") return;
    updateConnectionInfo({
      connection_id,
      audioMute: mute,
    });
  });

  client.on("updateremotetrack", ({ connection_id, mediaStreamTrack, stream, meta }) => {
    if (mediaStreamTrack.kind === "audio") return;
    updateConnectionInfo({
      connection_id,
      cameraName: (meta as DemoAppMeta).cameraName,
    });
  });

  client.on("updatemute", ({ connection_id, mediaStreamTrack, mute }) => {
    if (mediaStreamTrack.kind === "video") return;
    updateConnectionInfo({
      connection_id,
      audioMute: mute,
    });
  });

  client.on("changestability", ({ connection_id, stability }) => {
    updateConnectionInfo({
      connection_id,
      stability,
    });
  });

  return client;
}

function makeConnectOption(meta: Object): ConnectOption {
  const ret: ConnectOption = { localLSTracks: lsTracks, meta, iceServersProtocol };
  if (!receivingEnabled) {
    ret.receiving = {};
    ret.receiving.enabled = false;
  }

  const svo: SendingVideoOption = {};
  if (maxBitrateKbps !== 0) svo.maxBitrateKbps = maxBitrateKbps;
  if (sendingPriority !== "normal") svo.priority = sendingPriority;
  if (videoCodec !== "h264") svo.codec = videoCodec;

  if (svo !== {}) {
    ret.sending = {};
    ret.sending.video = svo;
  }
  return ret;
}

async function connect(): Promise<boolean> {
  try {
    const resp = await fetch(`http://localhost:8000/login?room=${roomId}`);
    const access_token: string = await resp.text();

    const constraints = {
      video: { deviceId: { exact: initialVideoDevice }, width: 640, height: 480 },
      audio: { deviceId: { exact: initialAudioDevice } },
    };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    lsTracks = stream.getTracks().map((mediaStreamTrack) => {
      const mute = mediaStreamTrack.kind === "video" ? initialVideoMute : initialAudioMute;
      const trackOption = { mute: mute as MuteType, meta: { cameraName: "" } };
      return new LSTrack(mediaStreamTrack, stream, trackOption);
    });
    client = createClient();
    const name = `user${Date.now()}`;
    const hand: HandType = "none";
    ($("#localText") as HTMLDivElement).innerText = name;
    const meta = { name, hand };
    const connectOption = makeConnectOption(meta);
    client.connect(Credential.CLIENT_ID, access_token, connectOption);
  } catch (e) {
    if (e instanceof SDKError) {
      onSDKError(e.detail, e.toReportString());
    } else {
      console.error(e);
    }
  }
  return true;
}

function disconnect(): boolean {
  if (!client) {
    console.error("no client");
    return false;
  }
  const state = client.getState();
  if (state !== "open") {
    console.error(`state(${state}) != "open"`);
    return false;
  }
  lsTracks.forEach((lsTrack) => {
    lsTrack.mediaStreamTrack.stop();
  });
  client.disconnect();
  return true;
}

$("#connect")?.addEventListener("click", async (e) => {
  const display = ($("#connect") as HTMLDivElement).innerText;
  if (display === "connect") {
    if (await connect()) {
      ($("#connect") as HTMLButtonElement).disabled = true;
      ($("#options") as HTMLDivElement).style.display = "none";
    }
  } else {
    if (disconnect()) {
      ($("#connect") as HTMLButtonElement).disabled = true;
      ($("#options") as HTMLDivElement).style.display = "none";
      ($("#remoteStreams") as HTMLDivElement).textContent = "";
      ($("#localStream") as HTMLVideoElement).srcObject = null;
    }
  }
});

function isConnected() {
  return ($("#connect") as HTMLButtonElement).innerText === "disconnect";
}

let initialAudioMute = "softmute";
let initialVideoMute = "softmute";
let initialAudioDevice = "default";
let initialVideoDevice = "default";
let initialHand = "none";

function changeMute(kind: string, mute: string) {
  const lsTrack = lsTracks.filter((lsTrack) => lsTrack.mediaStreamTrack.kind === kind)[0];
  client?.changeMute(lsTrack, mute as MuteType);
}

function updateMeta(hand: HandType) {
  client?.updateMeta({ hand });
}

function changeCameraName(kind: string, cameraName: string) {
  const lsTrack = lsTracks.filter((lsTrack) => lsTrack.mediaStreamTrack.kind === kind)[0];
  client?.updateTrackMeta(lsTrack, { cameraName });
}

async function changePreview(deviceId: string, mute: string) {
  if (mute !== "unmute") {
    ($("#localStream") as HTMLVideoElement).srcObject = null;
    return;
  }
  try {
    const constraints = {
      video: { deviceId: { exact: deviceId }, width: 640, height: 480 },
      audio: false,
    };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    ($("#localStream") as HTMLVideoElement).srcObject = stream;
  } catch (e) {
    console.error(e);
  }
}

$("#amute")?.addEventListener("change", async (e) => {
  const mute = ($("input:checked[name=amute]") as HTMLSelectElement)?.value;
  if (isConnected()) changeMute("audio", mute);
  else initialAudioMute = mute;
});

$("#vmute")?.addEventListener("change", async (e) => {
  const mute = ($("input:checked[name=vmute]") as HTMLSelectElement)?.value;
  if (isConnected()) changeMute("video", mute);
  else {
    initialVideoMute = mute;
    const deviceId = ($("#videoSource") as HTMLSelectElement)?.value;
    await changePreview(deviceId, mute);
  }
});

$("#meta")?.addEventListener("change", async (e) => {
  const hand = ($("input:checked[name=meta]") as HTMLSelectElement)?.value;
  if (isConnected()) updateMeta(hand as HandType);
  else initialHand = hand;
});

$("#audioSource")?.addEventListener("change", async (e) => {
  const deviceId = ($("#audioSource") as HTMLSelectElement)?.value;
  if (isConnected()) {
  } else initialAudioDevice = deviceId;
});

$("#videoSource")?.addEventListener("change", async (e) => {
  const option = $("#videoSource") as HTMLSelectElement;
  const deviceId = option.value;
  if (isConnected()) {
    changeCameraName("video", option[option.selectedIndex].innerText);
  } else {
    initialVideoDevice = deviceId;
    const mute = ($("input:checked[name=vmute]") as HTMLSelectElement)?.value;
    await changePreview(deviceId, mute);
  }
});

$("#option")?.addEventListener("click", async (e) => {
  const style = ($("#options") as HTMLDivElement).style.display;
  const newStyle = style === "block" ? "none" : "block";
  ($("#options") as HTMLDivElement).style.display = newStyle;
});

$("#start")?.addEventListener("click", async (e) => {
  const isCodecType = (txt: string): txt is VideoCodecType => txt === "h264" || txt === "vp8" || txt === "vp9" || txt === "h265" || txt === "av1";

  const isPriolity = (txt: string): txt is SendingPriority => txt === "normal" || txt === "high";

  let txt = "";
  roomId = ($("#roomId") as HTMLInputElement).value;
  if (roomId === "") return;

  const reIDString = /^[a-zA-Z0-9.%+^_"`{|}~<>\-]{1,255}$/;
  if (!reIDString.test(roomId)) return;

  txt = ($("#videoCodec") as HTMLInputElement).value;
  if (txt !== "") {
    if (!isCodecType(txt)) return;
    videoCodec = txt;
  }

  txt = ($("#sendingPriority") as HTMLInputElement).value;
  if (txt !== "") {
    if (!isPriolity(txt)) return;
    sendingPriority = txt;
  }

  txt = ($("#maxBitrateKbps") as HTMLInputElement).value;
  if (txt !== "") {
    const num = parseInt(txt, 10);
    if (num < 100 || 20000 < num) return;
    maxBitrateKbps = num;
  }

  txt = ($("#receivingEnabled") as HTMLInputElement).value;
  if (txt !== "") {
    if (txt === "true") receivingEnabled = true;
    else if (txt === "false") receivingEnabled = false;
    else return;
  }

  txt = ($("#iceServersProtocol") as HTMLInputElement).value;
  if (txt !== "") {
    if (txt === "all") iceServersProtocol = txt;
    else if (txt === "udp") iceServersProtocol = txt;
    else if (txt === "tcp") iceServersProtocol = txt;
    else if (txt === "tls") iceServersProtocol = txt;
    else return;
  }

  ($("#prepare") as HTMLDivElement).style.display = "none";
  ($("#main") as HTMLDivElement).style.display = "block";
});

$("#dlLog")?.addEventListener("click", (e) => {
  const result = `${client?.getHeadReport()}${client?.getTailReport()}`;
  const downLoadLink = document.createElement("a");
  downLoadLink.download = "log.txt";
  downLoadLink.href = URL.createObjectURL(new Blob([result], { type: "text.plain" }));
  downLoadLink.dataset.downloadurl = ["text/plain", downLoadLink.download, downLoadLink.href].join(":");
  downLoadLink.click();
});

$("#dlStatsLog")?.addEventListener("click", (e) => {
  const result = `${client?.getStatsReport()}`;
  const downLoadLink = document.createElement("a");
  downLoadLink.download = "statslog.txt";
  downLoadLink.href = URL.createObjectURL(new Blob([result], { type: "text.plain" }));
  downLoadLink.dataset.downloadurl = ["text/plain", downLoadLink.download, downLoadLink.href].join(":");
  downLoadLink.click();
});

async function initDevice() {
  const addOption = (dom: HTMLSelectElement, value: string, text: string) => {
    let found = false;
    const len = dom.options.length;
    for (let i = 0; i < len; i++) {
      if (dom.options.item(i)?.value === value) {
        found = true;
        break;
      }
    }
    if (found) return;

    const option = document.createElement("option");
    option.value = value;
    option.text = text;
    dom.appendChild(option);
  };
  const $audioSource = $("#audioSource") as HTMLSelectElement;
  while ($audioSource.options.length) $audioSource.remove(0);
  const $videoSource = $("#videoSource") as HTMLSelectElement;
  while ($videoSource.options.length) $videoSource.remove(0);
  const constraints = {
    video: { width: 640, height: 480 },
    audio: false,
  };
  await navigator.mediaDevices.getUserMedia(constraints);
  const deviceInfos = await navigator.mediaDevices.enumerateDevices();
  for (let i = 0; i !== deviceInfos.length; ++i) {
    const deviceInfo = deviceInfos[i];
    const value = deviceInfo.deviceId;
    if (deviceInfo.kind === "audioinput" && $audioSource) {
      if (initialAudioDevice === "default") initialAudioDevice = value;
      const text = deviceInfo.label;
      addOption($audioSource, value, text);
    } else if (deviceInfo.kind === "videoinput" && $videoSource) {
      if (initialVideoDevice === "default") initialVideoDevice = value;
      const text = deviceInfo.label;
      addOption($videoSource, value, text);
    }
  }
}

document.addEventListener("DOMContentLoaded", async (e) => {
  await initDevice();
});

navigator.mediaDevices.addEventListener("devicechange", async (e) => {
  await initDevice();
});

document.addEventListener("fullscreenchange", async (e) => {
  const videoId = (e.target as HTMLVideoElement).getAttribute("id");
  if (!videoId) return;
  const connection_id = videoId.split("_")[0];
  const requirement = document.fullscreenElement ? "unrequired" : "required";

  const others = connections.filter((connection) => connection.connection_id !== connection_id);
  others.forEach((connection) => {
    client?.changeMediaRequirements(connection.connection_id, requirement);
  });
});

document.addEventListener("fullscreenerror", async (e) => {
  console.error("fullscreenerror");
});
