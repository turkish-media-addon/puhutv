import { 
  createAddon, 
  runCli
} from "@mediaurl/sdk";
import * as cheerio from "cheerio";
const axios = require("axios");

interface PuhuTvItem {
  title: string;
  thumbnail: string;
  link: string;
  isDic: boolean;
}
interface idPuhuTvItem {
  downloads: string;
}

const parseId = async (html: string): Promise<idPuhuTvItem> => {
  const $ = cheerio.load(html);

  const tmp = $("#player_container").find("div").find("script")?.toString();
  const id = tmp.split("player.video.loader(")[1].split("', '")[1];

  return {
    downloads: id,
  };
};

const parseList = async (html: string, search: boolean): Promise<PuhuTvItem[]> => {
  const results: PuhuTvItem[] = [];
  const $ = cheerio.load(html);

  if (search) {
    $(".search-list-item").each((index, elem) => {
        const thumbnail = $(elem).find("img").attr("src") as string;
        const item: PuhuTvItem = {
          title: $(elem).find("a").find("div").find("p").text(),
          thumbnail: thumbnail || "",
          link: $(elem).find("a").first().attr("data-loc-href") as string,
          isDic: true
        };
        results.push(item);
      });
  } else {
    if ($("li.puhu-list-item").length == 0) {
      if(("ul.js-ga-player-tab-content li").length > 0) {
        $("ul.js-ga-player-tab-content li").each((index, elem) => {
          const thumbnail = $(elem).find("img").attr("src") as string;
          const item: PuhuTvItem = {
            title: $(elem).find("img").first().attr("title") as string,
            thumbnail: thumbnail || "",
            link: $(elem).find("a").attr("href") as string,
            isDic: false
          };
          results.push(item);
        });
      }
    } else {
      $("li.puhu-list-item").each((index, elem) => {
        const thumbnail = $(elem).find("img").attr("src") as string;
        const item: PuhuTvItem = {
          title: $(elem).find("img").first().attr("title") as string,
          thumbnail: thumbnail || "",
          link: $(elem).find(".detail-inner").find("a").attr("href") as string,
          isDic: true
        };
        results.push(item);
      });
    }
  }
  return results;
};

export const puhutvAddon = createAddon({
  id: "puhutv",
  name: "PuhuTv",
  description: "Puhu Tv Videos",
  icon: "https://puhutv.com/app/themes/puhutv/assets/images/favicon.ico",
  version: "0.1.0",
  itemTypes: ["movie", "series"],
  dashboards: [
    {
      id: "/dizi",
      name: "Dizi",
    },
    {
      id: "/belgesel",
      name: "BELGESEL",
    },
    {
      id: "/turk-filmleri",
      name: "Türk Filmleri",
    },
    {
      id: "/yasam",
      name: "Yaşam Programları",
    },
    {
      id: "/puhutv-orijinal",
      name: "Puhutv Orijinal",
    },
    {
      id: "/cocuk",
      name: "Çocuk",
    },
  ],
  catalogs: [
    {
      features: {
        search: { enabled: true },
      },
      options: {
        imageShape: "landscape",
        displayName: true,
      },
    },
  ],
});

puhutvAddon.registerActionHandler("catalog", async (input, ctx) => {
  const { fetch } = ctx;
  const { id } = input; // cagetory get name

  let search = false;
  let link = "https://puhutv.com";
  if (id) {
    link = link + id; // get category
  } else if (input.search) {
    link =
    link +
      "/ajax/widget/render?widget=autocomplete_search&content_pool_id=28&keyword=" +
      input.search +
      " &load=1&language=tr"; // get search
    search = true;
  }
  const results = await fetch(link).then(async (resp) => {
    return parseList(await resp.text(), search);
  });


  return {
    nextCursor: null,
    items: results.map((item) => {
      const id = item.link;
      if (item.isDic) {
        return {
          id,
          ids: { id },
          type: "directory",
          name: `${item.title}`,
          images: {
            poster: item.thumbnail,
          },
        };
      } else {
        return {
          id,
          ids: { id },
          type: "movie",
          name: `${item.title}`,
          images: {
            poster: item.thumbnail,
          },
        };
      }
     
    }),
  };
});

puhutvAddon.registerActionHandler("item", async (input, ctx) => {
  const { fetch } = ctx;
  const url = "https://puhutv.com" + input.ids.id;
  var videoarray = new Array();
  var qualities = ["144", "240", "360", "480", "720", "1080", "2160"];

  const result = await fetch(url).then(async (resp) =>
    parseId(await resp.text())
  );

  const datajson = `https://dygvideo.dygdigital.com/api/video_info?akamai=true&PublisherId=29&ReferenceId=${result.downloads}&SecretKey=NtvApiSecret2014*`;

  const getDygvideo = () => {
    try {
      return axios.get(datajson);
    } catch (error) {
      console.error(error);
    }
  };

  const dygvideo = await getDygvideo();
  const dataDetail = dygvideo.data.data;

  var source = dataDetail.flavors.hls;
  for (var i in qualities) {
    videoarray.push({
      type: "url",
      url: source + "P" + qualities[i],
      name: qualities[i] + "p",
    });
  }
  return {
    type: "movie",
    ids: input.ids,
    title: dataDetail.media_analytics.show,
    name: dataDetail.media_analytics.title_event_name,
    description: dataDetail.description,
    images: {
      poster: dataDetail.screenshots[0].image_url,
    },
    sources: videoarray,
  };
});

runCli([puhutvAddon], { singleMode: true });