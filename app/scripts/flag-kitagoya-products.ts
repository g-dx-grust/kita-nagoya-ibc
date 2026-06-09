/**
 * 手間賃リストに載っていた商品だけを「北名古屋で使用(usedAtKitagoya)」としてマークする暫定バックフィル。
 * 名称は全角/半角カナ・全角英数・空白の表記ゆれがあるため normalizeForSearch + 空白除去で照合する。
 * リスト行には2商品が連結された行もあるため、リスト全体を1つの正規化ブロブにして「商品の正式名称が
 * ブロブに含まれるか」で判定する(連結に強い)。
 *
 *   ドライラン: npx tsx scripts/flag-kitagoya-products.ts
 *   反映      : npx tsx scripts/flag-kitagoya-products.ts apply
 */
import { PrismaClient } from "@prisma/client";
import { normalizeForSearch } from "../src/lib/search";

const RAW = `
3P揚げにんにく48g山一千成B
3P粒ﾋﾟｰ110g山一千成B
3種の海鮮チーズ
揚げにんにく(裸)80g
揚げ塩ぎんなんﾃﾄﾗ42ｇ
揚げ塩ぎんなんﾃﾄﾗ42ｇ  長登屋
揚げ塩ぎんなんﾃﾄﾗ42g　ｸﾘｴｲﾄSD
揚げ塩ぎんなんﾃﾄﾗ52ｇｶﾈﾀ
NIDﾋﾟﾘ辛味 贅沢焼かま 18g
浅草くじらやのもつ煮込み風味ﾎﾟﾃﾄｽﾃｨｯｸ
ＮＩＤ贅沢焼かま 65g
NTS焼めざし14g
NTSするめそーめん10ｇ
NTS揚塩ぎんなんｽﾊﾟｲｼｰﾊｰﾌﾞｿﾙﾄ18g
NTSたらっぺ22g
揚げにんにく(裸)80g　さきいか(金袋大)70gﾘｶｰB
いか短冊(金袋大)85gﾘｶｰB
いかｼﾞｬｰｷｰ155ｇ
いかｼﾞｬｰｷｰ120ｇ
うめ玉 ｱｽﾃﾙﾌｧｰﾑ　ｸﾞﾘｰﾝｸﾛｽB
うめ玉 ｱｽﾃﾙﾌｧｰﾑ　千年屋B
赤ﾃｰﾌﾟ)うめ玉100g千年屋A極辛カツ45g　(赤ﾃｰﾌﾟごくから)45g
激辛カツ55g
甲州鳥モツ煮味フライコーン70g
個包装ミックス4種入り
個食美学たらっぺ28gｼｭﾘﾝﾌﾟﾍｯﾄﾞ35g信濃屋B
GIANTS 柿の種＆ピーナッツ　長登屋
節分豆60g
素焼きﾏｶﾀﾞﾐｱﾅｯﾂ40g
くんさき(素材主義)45g丸味食品
丸味おしゃぶりするめ（素材主義）無地チャック袋
さきいか(素材主義)40g丸味食品
焼きかま梅昆布(素材主義)60g丸味食品
箱ｼｰﾙ3面　するめｿｰﾒﾝ(浜だより)35gﾘｶｰB
箱ｼｰﾙ3面　焼かまｿｰﾒﾝ(浜だより)80gﾘｶｰB
箱ｼｰﾙ3面　焼あじ(浜だより)58gﾘｶｰB
箱ｼｰﾙ3面　ピリ辛焼きかま(浜だより)60gﾘｶｰB
箱ｼｰﾙ3面　無選別イカジャキー(浜だより)180gﾘｶｰB日本産　帆立三昧　谷貝B
松合醤油ｱｰﾓﾝﾄﾞ80g
パイナップルコアスティック136g
焼きかま白トリュフ50g
ﾔﾏﾛｸ醤油ｱｰﾓﾝﾄﾞ75gﾔﾏﾛｸB
ハロウィンちび勝POT60g
ハロウィンちび勝かぼちゃ袋60g
わさびﾋﾟｽﾀﾁｵﾃﾄﾗ  90g紀ノ國屋用
不揃いのするめｿｰﾒﾝ80gﾘｶｰB
ﾋﾟｽﾀﾁｵ95ｇ ﾘｶｰﾌｰｽﾞ(ﾅｯﾂｺﾚｸｼｮﾝｵﾚﾝｼﾞﾝ小）
半生トマト
生梅ｱｽﾊﾟﾙﾃｰﾑ100gなるみB
生梅ｱｽﾊﾟﾙﾃｰﾑ100g KSB
生梅ﾋﾟﾛ(A)190gなるみB
なるみ物産 福豆36g
NS 単品95gｽﾙﾒｿｰﾒﾝ大黒天物産  D-PRICE おくらｽﾅｯｸ梅かつお味42g
おくら梅かつお53g KSB
おくらスナック　丸味食品54g
おつまみ緑一色　浅漬け風味
おつまみ良選ﾁｰｽﾞかまぼこ　4本入（1本 14g）
お徳用焼きかま久助260gKSB
大阪ちびｶﾂ72g
おつまみチョイス　炙り焼きあじ75g
おつまみチョイス　えいひれ48g
丸味Bおくらｽﾅｯｸ梅かつおｽﾀﾝﾄﾞﾊﾟｯｸ54g
ガブリチキンおつまみコーンニンニク醤油唐揚げ風味
くんさき(個食美学ﾌﾟﾗｽ)  30ｇ
黒ｺﾞﾏ物語50ｇくんさき(こだわり宣言)54g
スルメソーメン　(こだわり宣言) 48g
たらっぺ(こだわり宣言) 92g
さきいか(こだわり宣言) 47g
粒ﾋﾟｰ(こだわり宣言)260g
いか短冊(つまみの達人)40gﾘｶｰB
小あじの開き(つまみの達人)35gﾘｶｰB
さきいか(つまみの達人)35g ﾘｶｰB
ﾋﾟﾘ辛焼かまｽﾃｨｯｸ(つまみの達人)35g
焼貝ひも(つまみの達人)35gﾘｶｰB
焼きかまｿｰﾒﾝ(つまみの達人)65g ﾘｶｰBサクじわチョコボーロ250g角ポット
揚げ塩ぎんなん155g角POT　エストラスト
特盛りﾁｷﾝｶｯﾄ麺  ﾚﾝｹﾞ付谷貝B
チャンピオンカレー　ミニカツ
つかみ取りチャレンジちび勝ミニバン500g
ド情熱価格オクラ梅かつおテトラ44g
ドライ塩トマト瀬戸内レモン味45g
ドライ塩トマト瀬戸内レモン味 みつる園60g
ﾃﾞｰﾂ種なしﾃﾞｸﾞﾚｯﾄ･ﾉｰﾙ120g (20入)
ドライりんごバター風味40g
ﾃﾞﾘｼｱするめｿｰﾒﾝ35g
特盛チキンカット麺200g
ﾄﾞﾗｲ塩とまとﾋﾟﾛ90g
ﾄﾞﾗｲ塩とまと 350ｇ
ﾄﾞﾗｲ塩とまと 240ｇ なるみ
ﾄﾞﾗｲ塩とまとﾋﾟﾛﾊﾞﾗ 5kg
ﾄﾞﾗｲ塩ﾄﾏﾄﾋﾟﾛ60gｽﾀﾝﾄﾞﾊﾟｯｸ夢ｸﾘｴｲﾄB
おさつミックス　藍の村 150g
トリュフポテトスティック　藍の村 150g
無選別イカジャキー95g
無選別するめソーメン95g谷貝明太チーズもんじゃポテトスティック25g×6袋
めんたいチーズおかき　やまや
ﾐｯｸｽﾅｯﾂ有塩大袋500gなるみB
焼貝ひも120ｇ
焼貝ひも110gﾋﾟﾛ
焼きかまぼこ ﾐｽﾀｰﾏｯｸｽB 125g
焼きかまぼこ ﾐｽﾀｰﾏｯｸｽB KS共配30ｇ
焼きあじピロ12P
大黒天物産　Dプライス焼きかま 30g
大黒天物産　こんがり焼きかま 70g
横綱じゃが棒
割れｲｶﾌﾗｲ300gKSB
割れｶｼｭｰﾅｯﾂ520gKSB
割れﾏﾖｲｰｶ300gKSB
割れﾐｯｸｽﾅｯﾂ450gKSB
わさびﾋﾟｽﾀﾁｵﾃﾄﾗ  90g紀ノ國屋用
`;

const noSpace = (s: string) => normalizeForSearch(s).replace(/ /g, "");

async function main() {
  const apply = process.argv.includes("apply");
  const prisma = new PrismaClient();
  try {
    const lines = RAW.split("\n").map((l) => l.trim()).filter(Boolean);
    const blob = noSpace(lines.join(" "));

    const products = await prisma.product.findMany({
      where: { active: true },
      select: { id: true, productCode: true, officialName: true },
      orderBy: { productCode: "asc" },
    });

    const matched: typeof products = [];
    const unmatched: typeof products = [];
    for (const p of products) {
      const key = noSpace(p.officialName);
      if (key.length >= 4 && blob.includes(key)) matched.push(p);
      else unmatched.push(p);
    }

    // リスト側で1商品もヒットしなかった行(タイプミス/DB未登録の検出用)
    const productKeys = products.map((p) => noSpace(p.officialName)).filter((k) => k.length >= 4);
    const linesNoHit = lines.filter((line) => {
      const ln = noSpace(line);
      return !productKeys.some((k) => ln.includes(k));
    });

    console.log(`対象リスト行: ${lines.length}`);
    console.log(`商品(active)総数: ${products.length}`);
    console.log(`★ 北名古屋として一致: ${matched.length}`);
    console.log(`  非該当(false予定): ${unmatched.length}`);
    console.log("");
    console.log("=== 一致した商品 (北名古屋=true) ===");
    for (const p of matched) console.log(`  ${p.productCode}\t${p.officialName}`);
    console.log("");
    console.log(`=== リスト行のうちDB商品に1件も一致しなかった行 (${linesNoHit.length}) ===`);
    for (const l of linesNoHit) console.log(`  ✗ ${l}`);

    if (apply) {
      const ids = new Set(matched.map((p) => p.id));
      const on = await prisma.product.updateMany({ where: { id: { in: [...ids] } }, data: { usedAtKitagoya: true } });
      const off = await prisma.product.updateMany({ where: { id: { notIn: [...ids] } }, data: { usedAtKitagoya: false } });
      console.log("");
      console.log(`APPLIED: usedAtKitagoya=true -> ${on.count} 件 / false -> ${off.count} 件`);
    } else {
      console.log("");
      console.log("(ドライラン。反映するには `npx tsx scripts/flag-kitagoya-products.ts apply`)");
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
