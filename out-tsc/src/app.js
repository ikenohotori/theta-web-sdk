var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
import { Client, LSTrack, SDKError } from "@ricoh-live-streaming-api/ricoh-ls-sdk";
import { Credential } from "./credential";
const $ = document.querySelector.bind(document);
let lsTracks = [];
let client = null;
let connections = [];
let roomId = "";
let videoCodec = "h264";
let sendingPriority = "normal";
let maxBitrateKbps = 0;
let receivingEnabled = true;
let iceServersProtocol = undefined;
function updateConnectionInfo(info) {
    const displayText = (name, audioMute, hand, cameraName, stability) => {
        let ret = "";
        if (stability !== "initial" && stability !== "stable") {
            const warning = stability === "unstable" ? "⚠" : "❌";
            ret = `${warning} `;
        }
        ret = `${name}`;
        if (cameraName && cameraName !== "")
            ret = `${ret} (${cameraName})`;
        if (audioMute === "unmute")
            ret = `${ret} 🔊`;
        else
            ret = `${ret} 🔇`;
        if (hand === "raise")
            ret = `${ret} ✋`;
        return ret;
    };
    connections.forEach((connection) => {
        if (connection.connection_id === info.connection_id) {
            if (info.name)
                connection.name = info.name;
            if (info.audioMute)
                connection.audioMute = info.audioMute;
            if (info.hand)
                connection.hand = info.hand;
            if (info.cameraName)
                connection.cameraName = info.cameraName;
            const $text = $(`#${info.connection_id}_text`);
            $text.innerText = displayText(connection.name, connection.audioMute, connection.hand, connection.cameraName);
        }
    });
}
let fullScreenConnection = "";
function onSDKError(e, errstr) {
    $("#errMsg").innerText = e.error;
    $("#reportStr").innerText = errstr;
    $("#error").style.display = "block";
    $("#remoteStreams").innerHTML = "";
    $("#localStream").srcObject = null;
    $("#main").style.display = "none";
}
function createClient() {
    const client = new Client();
    client.on("error", (e) => {
        onSDKError(e.detail, e.toReportString());
    });
    client.on("open", (e) => {
        $("#connect").disabled = false;
        $("#connect").innerText = "disconnect";
    });
    client.on("close", (e) => {
        $("#connect").disabled = false;
        $("#connect").innerText = "connect";
    });
    client.on("addlocaltrack", ({ mediaStreamTrack, stream }) => {
        $("#localStream").srcObject = stream;
    });
    client.on("addremoteconnection", ({ connection_id, meta }) => {
        let $container = $(`#${connection_id}`);
        if ($container)
            return;
        $container = document.createElement("div");
        $container.id = connection_id;
        const $video = document.createElement("video");
        $video.id = `${connection_id}_video`;
        $video.setAttribute("playsinline", "");
        $video.ondblclick = () => {
            $video.requestFullscreen();
            fullScreenConnection = connection_id;
        };
        $container.appendChild($video);
        const $text = document.createElement("div");
        $text.id = `${connection_id}_text`;
        $container.appendChild($text);
        $("#remoteStreams").appendChild($container);
        connections.push({
            connection_id,
            name: meta.name,
            audioMute: "unmute",
            hand: "none",
            cameraName: "",
            stability: "initial",
        });
    });
    client.on("updateremoteconnection", ({ connection_id, meta }) => {
        updateConnectionInfo({
            connection_id,
            hand: meta.hand,
        });
    });
    client.on("removeremoteconnection", ({ connection_id, meta, mediaStreamTrack }) => {
        let $container = $(`#${connection_id}`);
        if ($container)
            return;
        $("#remoteStreams").removeChild($container);
        connections = connections.filter((connection) => connection.connection_id !== connection_id);
    });
    client.on("addremotetrack", async ({ connection_id, mediaStreamTrack, stream, mute }) => {
        const $video = $(`#${connection_id}_video`);
        if (!$video)
            return;
        if ($video.srcObject)
            $video.srcObject.addTrack(mediaStreamTrack);
        else
            $video.srcObject = stream;
        await $video.play();
        if (mediaStreamTrack.kind === "video")
            return;
        updateConnectionInfo({
            connection_id,
            audioMute: mute,
        });
    });
    client.on("updateremotetrack", ({ connection_id, mediaStreamTrack, stream, meta }) => {
        if (mediaStreamTrack.kind === "audio")
            return;
        updateConnectionInfo({
            connection_id,
            cameraName: meta.cameraName,
        });
    });
    client.on("updatemute", ({ connection_id, mediaStreamTrack, mute }) => {
        if (mediaStreamTrack.kind === "video")
            return;
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
function makeConnectOption(meta) {
    const ret = { localLSTracks: lsTracks, meta, iceServersProtocol };
    if (!receivingEnabled) {
        ret.receiving = {};
        ret.receiving.enabled = false;
    }
    const svo = {};
    if (maxBitrateKbps !== 0)
        svo.maxBitrateKbps = maxBitrateKbps;
    if (sendingPriority !== "normal")
        svo.priority = sendingPriority;
    if (videoCodec !== "h264")
        svo.codec = videoCodec;
    if (svo !== {}) {
        ret.sending = {};
        ret.sending.video = svo;
    }
    return ret;
}
async function connect() {
    try {
        const resp = await fetch(`http://localhost:8000/login?room=${roomId}`);
        const access_token = await resp.text();
        const constraints = {
            video: { deviceId: { exact: initialVideoDevice }, width: 640, height: 480 },
            audio: { deviceId: { exact: initialAudioDevice } },
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        lsTracks = stream.getTracks().map((mediaStreamTrack) => {
            const mute = mediaStreamTrack.kind === "video" ? initialVideoMute : initialAudioMute;
            const trackOption = { mute: mute, meta: { cameraName: "" } };
            return new LSTrack(mediaStreamTrack, stream, trackOption);
        });
        client = createClient();
        const name = `user${Date.now()}`;
        const hand = "none";
        $("#localText").innerText = name;
        const meta = { name, hand };
        const connectOption = makeConnectOption(meta);
        client.connect(Credential.CLIENT_ID, access_token, connectOption);
    }
    catch (e) {
        if (e instanceof SDKError) {
            onSDKError(e.detail, e.toReportString());
        }
        else {
            console.error(e);
        }
    }
    return true;
}
function disconnect() {
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
(_a = $("#connect")) === null || _a === void 0 ? void 0 : _a.addEventListener("click", async (e) => {
    const display = $("#connect").innerText;
    if (display === "connect") {
        if (await connect()) {
            $("#connect").disabled = true;
            $("#options").style.display = "none";
        }
    }
    else {
        if (disconnect()) {
            $("#connect").disabled = true;
            $("#options").style.display = "none";
            $("#remoteStreams").textContent = "";
            $("#localStream").srcObject = null;
        }
    }
});
function isConnected() {
    return $("#connect").innerText === "disconnect";
}
let initialAudioMute = "softmute";
let initialVideoMute = "softmute";
let initialAudioDevice = "default";
let initialVideoDevice = "default";
let initialHand = "none";
function changeMute(kind, mute) {
    const lsTrack = lsTracks.filter((lsTrack) => lsTrack.mediaStreamTrack.kind === kind)[0];
    client === null || client === void 0 ? void 0 : client.changeMute(lsTrack, mute);
}
function updateMeta(hand) {
    client === null || client === void 0 ? void 0 : client.updateMeta({ hand });
}
function changeCameraName(kind, cameraName) {
    const lsTrack = lsTracks.filter((lsTrack) => lsTrack.mediaStreamTrack.kind === kind)[0];
    client === null || client === void 0 ? void 0 : client.updateTrackMeta(lsTrack, { cameraName });
}
async function changePreview(deviceId, mute) {
    if (mute !== "unmute") {
        $("#localStream").srcObject = null;
        return;
    }
    try {
        const constraints = {
            video: { deviceId: { exact: deviceId }, width: 640, height: 480 },
            audio: false,
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        $("#localStream").srcObject = stream;
    }
    catch (e) {
        console.error(e);
    }
}
(_b = $("#amute")) === null || _b === void 0 ? void 0 : _b.addEventListener("change", async (e) => {
    var _a;
    const mute = (_a = $("input:checked[name=amute]")) === null || _a === void 0 ? void 0 : _a.value;
    if (isConnected())
        changeMute("audio", mute);
    else
        initialAudioMute = mute;
});
(_c = $("#vmute")) === null || _c === void 0 ? void 0 : _c.addEventListener("change", async (e) => {
    var _a, _b;
    const mute = (_a = $("input:checked[name=vmute]")) === null || _a === void 0 ? void 0 : _a.value;
    if (isConnected())
        changeMute("video", mute);
    else {
        initialVideoMute = mute;
        const deviceId = (_b = $("#videoSource")) === null || _b === void 0 ? void 0 : _b.value;
        await changePreview(deviceId, mute);
    }
});
(_d = $("#meta")) === null || _d === void 0 ? void 0 : _d.addEventListener("change", async (e) => {
    var _a;
    const hand = (_a = $("input:checked[name=meta]")) === null || _a === void 0 ? void 0 : _a.value;
    if (isConnected())
        updateMeta(hand);
    else
        initialHand = hand;
});
(_e = $("#audioSource")) === null || _e === void 0 ? void 0 : _e.addEventListener("change", async (e) => {
    var _a;
    const deviceId = (_a = $("#audioSource")) === null || _a === void 0 ? void 0 : _a.value;
    if (isConnected()) {
    }
    else
        initialAudioDevice = deviceId;
});
(_f = $("#videoSource")) === null || _f === void 0 ? void 0 : _f.addEventListener("change", async (e) => {
    var _a;
    const option = $("#videoSource");
    const deviceId = option.value;
    if (isConnected()) {
        changeCameraName("video", option[option.selectedIndex].innerText);
    }
    else {
        initialVideoDevice = deviceId;
        const mute = (_a = $("input:checked[name=vmute]")) === null || _a === void 0 ? void 0 : _a.value;
        await changePreview(deviceId, mute);
    }
});
(_g = $("#option")) === null || _g === void 0 ? void 0 : _g.addEventListener("click", async (e) => {
    const style = $("#options").style.display;
    const newStyle = style === "block" ? "none" : "block";
    $("#options").style.display = newStyle;
});
(_h = $("#start")) === null || _h === void 0 ? void 0 : _h.addEventListener("click", async (e) => {
    const isCodecType = (txt) => txt === "h264" || txt === "vp8" || txt === "vp9" || txt === "h265" || txt === "av1";
    const isPriolity = (txt) => txt === "normal" || txt === "high";
    let txt = "";
    roomId = $("#roomId").value;
    if (roomId === "")
        return;
    const reIDString = /^[a-zA-Z0-9.%+^_"`{|}~<>\-]{1,255}$/;
    if (!reIDString.test(roomId))
        return;
    txt = $("#videoCodec").value;
    if (txt !== "") {
        if (!isCodecType(txt))
            return;
        videoCodec = txt;
    }
    txt = $("#sendingPriority").value;
    if (txt !== "") {
        if (!isPriolity(txt))
            return;
        sendingPriority = txt;
    }
    txt = $("#maxBitrateKbps").value;
    if (txt !== "") {
        const num = parseInt(txt, 10);
        if (num < 100 || 20000 < num)
            return;
        maxBitrateKbps = num;
    }
    txt = $("#receivingEnabled").value;
    if (txt !== "") {
        if (txt === "true")
            receivingEnabled = true;
        else if (txt === "false")
            receivingEnabled = false;
        else
            return;
    }
    txt = $("#iceServersProtocol").value;
    if (txt !== "") {
        if (txt === "all")
            iceServersProtocol = txt;
        else if (txt === "udp")
            iceServersProtocol = txt;
        else if (txt === "tcp")
            iceServersProtocol = txt;
        else if (txt === "tls")
            iceServersProtocol = txt;
        else
            return;
    }
    $("#prepare").style.display = "none";
    $("#main").style.display = "block";
});
(_j = $("#dlLog")) === null || _j === void 0 ? void 0 : _j.addEventListener("click", (e) => {
    const result = `${client === null || client === void 0 ? void 0 : client.getHeadReport()}${client === null || client === void 0 ? void 0 : client.getTailReport()}`;
    const downLoadLink = document.createElement("a");
    downLoadLink.download = "log.txt";
    downLoadLink.href = URL.createObjectURL(new Blob([result], { type: "text.plain" }));
    downLoadLink.dataset.downloadurl = ["text/plain", downLoadLink.download, downLoadLink.href].join(":");
    downLoadLink.click();
});
(_k = $("#dlStatsLog")) === null || _k === void 0 ? void 0 : _k.addEventListener("click", (e) => {
    const result = `${client === null || client === void 0 ? void 0 : client.getStatsReport()}`;
    const downLoadLink = document.createElement("a");
    downLoadLink.download = "statslog.txt";
    downLoadLink.href = URL.createObjectURL(new Blob([result], { type: "text.plain" }));
    downLoadLink.dataset.downloadurl = ["text/plain", downLoadLink.download, downLoadLink.href].join(":");
    downLoadLink.click();
});
async function initDevice() {
    const addOption = (dom, value, text) => {
        var _a;
        let found = false;
        const len = dom.options.length;
        for (let i = 0; i < len; i++) {
            if (((_a = dom.options.item(i)) === null || _a === void 0 ? void 0 : _a.value) === value) {
                found = true;
                break;
            }
        }
        if (found)
            return;
        const option = document.createElement("option");
        option.value = value;
        option.text = text;
        dom.appendChild(option);
    };
    const $audioSource = $("#audioSource");
    while ($audioSource.options.length)
        $audioSource.remove(0);
    const $videoSource = $("#videoSource");
    while ($videoSource.options.length)
        $videoSource.remove(0);
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
            if (initialAudioDevice === "default")
                initialAudioDevice = value;
            const text = deviceInfo.label;
            addOption($audioSource, value, text);
        }
        else if (deviceInfo.kind === "videoinput" && $videoSource) {
            if (initialVideoDevice === "default")
                initialVideoDevice = value;
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
    const videoId = e.target.getAttribute("id");
    if (!videoId)
        return;
    const connection_id = videoId.split("_")[0];
    const requirement = document.fullscreenElement ? "unrequired" : "required";
    const others = connections.filter((connection) => connection.connection_id !== connection_id);
    others.forEach((connection) => {
        client === null || client === void 0 ? void 0 : client.changeMediaRequirements(connection.connection_id, requirement);
    });
});
document.addEventListener("fullscreenerror", async (e) => {
    console.error("fullscreenerror");
});
