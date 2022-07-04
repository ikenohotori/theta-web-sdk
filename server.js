const jwt = require("jsonwebtoken");
const { randomBytes } = require("crypto");
const Credential = require("./credential");

const Koa = require("koa");
const KoaRouter = require("koa-router");
const koaConvert = require("koa-convert");
const koaCors = require("kcors");
const serve = require("koa-better-serve");
const bodyParser = require("koa-bodyparser");

const TYPE = "sfu"; // "sfu"|"p2p"|"p2p_turn"
const MAX_CONNECTIONS = ""; // 1-10000(10000)
const BITRATE_RESERVATION_MBPS = ""; // 1-250(10)
const CLASSIFICATION_LABEL = ""; // IDString

const router = new KoaRouter();
router.get("/login", async (ctx, next) => {
  let room_id = ctx.request.query["room"];
  if (!room_id) room_id = "default_room";

  const room_spec = { type: TYPE };
  if (MAX_CONNECTIONS !== "") room_spec.max_connections = MAX_CONNECTIONS;
  if (BITRATE_RESERVATION_MBPS !== "") {
    room_spec.media_control = {};
    room_spec.media_control.bitrate_reservation_mbps = BITRATE_RESERVATION_MBPS;
  }
  if (CLASSIFICATION_LABEL !== "") room_spec.classification_label = CLASSIFICATION_LABEL;

  const connection_id = `id${randomBytes(16).reduce((p, i) => p + (i % 32).toString(32), "")}`;

  const payload = { connection_id, room_id, room_spec };
  const option = {
    notBefore: "-30m",
    expiresIn: "30m",
  };
  const token = jwt.sign(payload, Credential.CLIENT_SECRET, option);

  ctx.body = token;
});

const app = new Koa();
app.use(bodyParser());
app.use(koaConvert(koaCors()));
app.use(router.routes());
app.use(router.allowedMethods());
app.use(serve("./dist", "/"));
app.listen(8000);
