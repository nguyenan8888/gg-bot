const { GoogleSpreadsheet } = require("google-spreadsheet");
import { Context, Markup, Telegraf } from "telegraf";
import Promise from "bluebird";
import path from "path";
import axios from "axios";
import request from "request-promise";
// import { CheckTin } from './checktin';
const cheerio = require("cheerio");

export const BUTTON = {
  LIST_PIXEL: "🚀 Lấy List Pixel",
};
class Bot {
  constructor() {
    this.listPixel = [];
    this.initBot();
    this.listRefreshTokens = [];
  }
  async initBot() {
    try {
      this.bot = new Telegraf("7370817832:AAHImTh1G6fjiqiVX2-RBhhHXJTVZeT-734");
      this.bot.launch();
      this.botUsername = await (await this.bot.telegram.getMe()).username;
      console.log(`Started Bot ${this.botUsername}`);
      this.loadSheet();
      this.loadRefreshTokenSheet();
      this.eventListenter();
    } catch (error) {
      console.log("error :>> ", error);
    }
  }
  eventListenter() {
    try {
      this.bot.hears("/reload", async (ctx) => {
        const message = await ctx.reply("Reloading...", {
          reply_to_message_id: ctx.message.message_id,
        });
        await this.loadSheet();
        await this.loadRefreshTokenSheet();
        await ctx.deleteMessage(message.message_id);
        await ctx.reply(`✅ Load Thành công ${this.listPixel.length} Pixel`, {
          reply_to_message_id: ctx.message.message_id,
        });
      });
      this.bot.hears("/list-refreshToken", async (ctx) => {
        await ctx.reply(
          `✅ Còn ${this.listRefreshTokens.length} Token dự phòng`,
          {
            reply_to_message_id: ctx.message.message_id,
          }
        );
      });
      this.bot.on("message", (ctx) => this.onMsg(ctx));
    } catch (error) {
      console.log("error :>> ", error);
    }
  }
  async onMsg(ctx) {
    try {
      console.log("ctx.message.chat.id :>> ", ctx.message.chat.id);
      const msg = ctx.message.text;
      if (msg.startsWith("/share")) {
        return this.onShare(ctx, msg);
      }
      if (msg.startsWith("/check")) {
        let split = msg
          .replace("/check", "")
          .split(" ")
          .filter((e) => e);
        // let c = new CheckTin()
        // let bmid = split[0]
        // let country = split[1]
        // await ctx.reply(`Đang check ${bmid}`, { reply_to_message_id: ctx.message.message_id });
        // let hasErr = false
        // let listSend = []
        // for (let index = 0; index < 1; index++) {
        //     listSend = []
        //     hasErr = false
        //     let res = await c.check(country, bmid)
        //     if (typeof res == "string") {
        //         if (!res) {
        //             hasErr = true
        //             continue
        //         }
        //         listSend.push(res)
        //     } else {
        //         for (let item of res) {
        //             if (!item) {
        //                 hasErr = true
        //                 continue
        //             }
        //             listSend.push(item)
        //         }
        //     }
        //     if (!hasErr) break
        // }
        for (let item of listSend) {
          await ctx.reply(item, {
            reply_to_message_id: ctx.message.message_id,
          });
        }
        if (hasErr) {
          await ctx.reply(`Có lỗi xảy ra khi check`, {
            reply_to_message_id: ctx.message.message_id,
          });
        }
      }
    } catch (error) {
      console.log("error :>> ", error);
    }
  }
  waitOneSecond() {
    return new Promise((resolve) => {
      setTimeout(resolve, 500);
    });
  }
  async onShare(ctx, msg) {
    try {
      const msgSplit = msg.split(/\s+/);
      let NAME_PIXEL = msgSplit[1];
      let ID_TKQCs = msgSplit.filter((_, index) => index > 1);

      const pixelObject = this.listPixel.find(
        (e) => e["NAME_PIXEL"] == NAME_PIXEL
      );
      if (!pixelObject)
        return await ctx.reply("❌ Không tìm thấy pixel", {
          reply_to_message_id: ctx.message.message_id,
        });
      // const NAME_PIXEL = pixelObject['NAME_PIXEL'].trim()

      let message = await ctx.reply(
        `⌛️ Đang share ${NAME_PIXEL} cho List TKQC: ${ID_TKQCs.join(",")}`,
        { reply_to_message_id: ctx.message.message_id }
      );
      let success = [];
      let fail = [];
      let needRefreshToken = false;

      const res = await Promise.map(
        ID_TKQCs,
        async (e) => {
          try {
            let r = await this.share(ctx, NAME_PIXEL, e, pixelObject);
            if (r.code === 200) {
              success.push(e);
            } else {
              if (r.code === 368 || r.code === 190) needRefreshToken = true;
              fail.push(e);
            }
          } catch (error) {
            console.log("=============", JSON.stringify(error));
            fail.push(e);
          }
        },
        { concurrency: 20 }
      );

      await Promise.all([
        ctx.deleteMessage(message.message_id),
        ctx.reply(
          `✅ Share Thành công ${success.length} ✅\n${success.join(
            "\n"
          )}\n❌ Share Thất bại ${fail.length} ❌\n${fail.join("\n")}
          `,
          {
            reply_to_message_id: ctx.message.message_id,
          }
        ),
      ]);

      if (needRefreshToken) {
        await ctx.sendMessage({
          chat_id: ctx.chat.id,
          text: "Token hết hạn, đang thay token mới",
        });
        this.fillNewTokenToSheet();
        await ctx.sendMessage({
          chat_id: ctx.chat.id,
          text: "Đã thay token mới",
        });
        // setTimeout(() => {
        //   this.onShare(ctx, msg);
        // }, 1000)
      }
    } catch (error) {
      console.log(error);
      await ctx.reply(`❌ ${error.message}`, {
        reply_to_message_id: ctx.message.message_id,
      });
    }
  }
  async share(ctx, NAME_PIXEL, IDQC, pixelObject) {
    try {
      const pixelID = pixelObject["ID_PIXEL"];
      const IDBM = pixelObject["IDBM"].trim();
      const TOKEN = pixelObject["TOKEN"].trim();
      const NAME_PIXEL = pixelObject["NAME_PIXEL"].trim();
      // console.log('pixelObject :>> ', pixelObject);
      const url = `https://graph.facebook.com/v20.0/${pixelID}/shared_accounts`;
      // console.log('url :>> ', url);
      // let body = `account_id=${IDQC}&access_token=${TOKEN}&business=${IDBM}`
      console.log(TOKEN);
      const { data } = await axios({
        url,
        method: "post",
        data: {
          account_id: IDQC,
          business: IDBM,
          access_token: TOKEN,
        },
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
        },
      });

      if (data.success) {
        return { code: 200 };
      } else {
        return { code: 500 };
      }
    } catch (error) {
      console.log("error.response :>> ", error.response.data);
      const code = error.response.data.error.code || 500

      if (code === 368 || code === 190) {
        return { code };
      }

      return { code };
    }
  }
  getBW(text, Start, End) {
    var ret = text.split(Start);
    if (ret[1]) {
      ret = ret[1].split(End);
      return ret[0];
    }
    return 0;
  }

  async loadSheet() {
    try {
      this.listPixel.length = 0;
      const spreadsheetId = "1B-DcmTvVGHsVq9TSr4pryyW7d3C8UmY5Y4sh3adg2Ww";
      const doc = new GoogleSpreadsheet(spreadsheetId);
      const creds = require(path.join(__dirname, "gg.json"));
      await doc.useServiceAccountAuth(creds);
      await doc.loadInfo();
      const worksheet = doc.sheetsByIndex[0];
      const rows = await worksheet.getRows();
      for (let index = 0; index < rows.length; index++) {
        const item = rows[index];
        const { ID_PIXEL, NAME_PIXEL, TOKEN, IDBM } = item;
        this.listPixel.push({
          ID_PIXEL,
          NAME_PIXEL,
          TOKEN,
          IDBM,
          TOKEN_DIE: false,
          REASON: "",
        });
      }
      console.log("this.listPixel :>> ", this.listPixel);
      console.log(`Loaded ${this.listPixel.length} Cookie`);
    } catch (error) {
      console.log("error :>> ", error);
    }
  }

  async loadRefreshTokenSheet() {
    this.listRefreshTokens = [];
    const spreadsheetId = "1yV74rh7NXj8nIh8oRWkzI0uM-DdxpwNsOgmbx-Qw0dk";
    const doc = new GoogleSpreadsheet(spreadsheetId);
    const creds = require(path.join(__dirname, "gg.json"));
    await doc.useServiceAccountAuth(creds);
    await doc.loadInfo();
    const worksheet = doc.sheetsByIndex[0];
    const rows = await worksheet.getRows();
    for (let index = 0; index < rows.length; index++) {
      const item = rows[index];
      const { Token } = item;
      this.listRefreshTokens.push(Token);
    }
  }

  fillNewTokenToSheet() {
    if (this.listRefreshTokens.length === 0) {
      throw new Error("Hết Token");
    } else {
      const NEW_TOKEN = this.listRefreshTokens.shift();
      this.listPixel = this.listPixel.map((data) => ({
        ...data,
        TOKEN: NEW_TOKEN,
      }));
    }
  }
}
export { Bot };
