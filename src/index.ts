import { createAddon, runCli, DashboardItem, Catalog } from "@mediaurl/sdk";
import * as cheerio from "cheerio";
const axios = require("axios");
interface PuhuTvItem {
  title: string;
  thumbnail: string;
  link: string;
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

const parseList = async (
  html: string,
  search: boolean,
  id
): Promise<PuhuTvItem[]> => {
  const results: PuhuTvItem[] = [];
  const $ = cheerio.load(html);
  if (search) {
    $(".search-list-item").each((index, elem) => {
      const thumbnail = $(elem).find("img").attr("src") as string;
      const item: PuhuTvItem = {
        title: $(elem).find("a").find("div").find("p").text(),
        thumbnail: thumbnail || "",
        link: $(elem).find("a").first().attr("href") as string,
      };

      results.push(item);
    });
  } else {
    if (id.length != 0 && $("#" + id + " > li").length > 0) {
      $("#" + id + " > li").each((index, elem) => {
        const item: PuhuTvItem = {
          title: $(elem).find("img").first().attr("alt") as string,
          thumbnail:
            ($(elem).find("img").attr("data-src") as string) ||
            ($(elem).find("img").attr("src") as string),
          link:
            ($(elem).find("a").first().attr("data-href") as string) ||
            ($(elem).find("a").first().attr("href") as string),
        };
        results.push(item);
      });
    }

    if (
      id.length == 0 &&
      $("ul.featured-base-items.js-featured-base-scroll-mobile > li").length > 0
    ) {
      $("ul.featured-base-items.js-featured-base-scroll-mobile > li").each(
        (index, elem) => {
          const item: PuhuTvItem = {
            title: $(elem).find(".detail-content").text() as string,
            thumbnail: $(elem).find("img").attr("src") as string,
            link: $(elem).find("a").last().attr("href") as string,
          };
          results.push(item);
        }
      );
    }
  }
  return results;
};

const dashboardsList = async (): Promise<DashboardItem[]> => {
  let url = "https://puhutv.com";
  const { data } = await axios.get(url);
  const $ = cheerio.load(data);
  const dash: DashboardItem[] = [];
  $("ul.featured-base-items").each((index, elem) => {
    const item: DashboardItem = {
      id: ($(elem).attr("id") as string) || "",
      name: $(elem).find("li").attr("data-ga-slider-title") as string,
      hideOnHomescreen: false,
      options: {
        imageShape: "landscape",
        displayName: true,
      },
    };
    dash.push(item);
  });
  $("ul.puhu-slider-items").each((index, elem) => {
    const item: DashboardItem = {
      id: ($(elem).attr("id") as string) || "",
      name: $(elem).find("li").attr("data-ga-slider-title") as string,
      // if hideOnHomescreen is true, this dashboard will NOT be shown on the home screen in the app
      // I recommend to leave this to `false` which is the default
      hideOnHomescreen: false,
      options: {
        imageShape: "regular",
        displayName: true,
      },
    };
    dash.push(item);
  });

  return dash;
};

(async () => {
  const dashboardList = await dashboardsList();

  const puhutvAddon = createAddon({
    id: "puhutv",
    name: "PuhuTv",
    description: "Puhu Tv Videos",
    icon: "https://puhutv.com/app/themes/puhutv/assets/images/favicon.ico",
    version: "0.1.0",
    itemTypes: ["movie", "series"],
    catalogs: [
      {
        features: {
          search: { enabled: true },
        },
      },
    ],
    dashboards: dashboardList,
  });
  console.log(JSON.stringify(puhutvAddon.getProps(), null, 2));

  puhutvAddon.registerActionHandler("catalog", async (input, ctx) => {
    await dashboardsList();
    const { fetch } = ctx;
    const { id } = input; // cagetory get name
    let search = false;
    let url = "https://puhutv.com";

    if (id) {
      url = url; // get category
    } else if (input.search) {
      url =
        url +
        "ajax/widget/render?widget=autocomplete_search&content_pool_id=28&keyword=" +
        input.search +
        " &load=1&language=tr"; // get search
      search = true;
    }

    const results = await fetch(url).then(async (resp) => {
      return parseList(await resp.text(), search, id);
    });

    return {
      nextCursor: null,
      items: results.map((item) => {
        const id = item.link;
        return {
          id,
          ids: { id },
          type: "movie",
          name: `${item.title}`,
          images: {
            poster: item.thumbnail,
          },
        };
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
        url: source,
        name: dataDetail.media_analytics.show,
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

  runCli([puhutvAddon], { singleMode: false });
})();
