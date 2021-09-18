const knex = require('knex')({
    client: 'mysql',
    connection: {
        host:'google-account.cmlfk75xsv3h.ap-south-1.rds.amazonaws.com', 
        user: 'shahrushabh1996', 
        database: 'rapidTax',
        password: '11999966',
        ssl: 'Amazon RDS'
    }
});
const axios = require("axios")
const cheerio = require("cheerio")
const qs = require('qs');
const cluster = require('cluster')
const { performance } = require('perf_hooks');

async function fetchHTML(code) {
    var postData = qs.stringify({
        'cth': code,
        'item': '',
        'cntrycd': '',
        'submitbutton': 'Search' 
    });

    var config = {
        method: 'post',
        url: 'https://www.icegate.gov.in/Webappl/Tariff-head-details',
        headers: { 
          'Connection': 'keep-alive', 
          'Cache-Control': 'max-age=0', 
          'sec-ch-ua': '"Google Chrome";v="93", " Not;A Brand";v="99", "Chromium";v="93"', 
          'sec-ch-ua-mobile': '?0', 
          'sec-ch-ua-platform': '"macOS"', 
          'Upgrade-Insecure-Requests': '1', 
          'Origin': 'https://www.icegate.gov.in', 
          'Content-Type': 'application/x-www-form-urlencoded', 
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/93.0.4577.82 Safari/537.36', 
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9', 
          'Sec-Fetch-Site': 'same-origin', 
          'Sec-Fetch-Mode': 'navigate', 
          'Sec-Fetch-User': '?1', 
          'Sec-Fetch-Dest': 'document', 
          'Referer': 'https://www.icegate.gov.in/Webappl/index_imp.jsp', 
          'Accept-Language': 'en-GB,en-US;q=0.9,en;q=0.8', 
          'Cookie': 'TS015cbc79=016b3f3df45fed8aa463c2bff677912c1c832cb80dc99c5d3e6d964e72f59afc45b32651e90aa9ca00775193a0434b9a746bc6badc; JSESSIONID=F32494A2CE06632F573A9B3D516C00B6; style=blue; TS013f8d96=016b3f3df42c88b76870a5eed8dbec79c7129083a01bfcfceb5a651e99b72162825f543ac72acffffee298de85425325d2d2744ad6; JSESSIONID=A7E9A3172BAEF158AB358C8641D1F4C7; TS015cbc79=016b3f3df45fed8aa463c2bff677912c1c832cb80dc99c5d3e6d964e72f59afc45b32651e90aa9ca00775193a0434b9a746bc6badc; TS013f8d96=016b3f3df48e7f620222eb811f1344ea898348278ecc9d47d499bcb18e97e1091e8952a90341a9a49015b465331dde7d2ed97f1a09'
        },
        data : postData
      };

    const { data } = await axios(config)
    return cheerio.load(data)
}

(async () => {
    function timeout(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    if (cluster.isMaster) {
        console.log(`Primary ${process.pid} is running`);

        const connections = new Array(5).fill(0)

        for (let [index, connection] of connections.entries()) {
            await launchCluster()
        }

        async function launchCluster() {
            const clusterLaunch = cluster.fork()
            clusterLaunch.on('exit', async (worker, code, signal) => {
                console.log(`worker died`);
    
                await launchCluster()
            });
            await timeout(3000)
            return
        }
    } else {
        const batchHSNs = new Array(2000).fill(0)

        for (let batchHSN of batchHSNs) {
            // console.log(knex)

            const promisify = () => new Promise((resolve, reject) => knex.transaction(resolve));

            const trx = await promisify();

            let HSNs

            try {
                HSNs = await knex.select('id', 'HSN').from('importExport').where({detailsStatus: 'NOT STARTED'}).limit(1)

                console.log('HSNs Fetched')

                if (HSNs.length === 0) process.exit()

                await knex('importExport').where({id: HSNs[0].id}).update({
                    detailsStatus: 'PROCESSING'
                })

                await trx.commit();
            } catch (err) {
                await trx.rollback();
            }

            const t0 = performance.now()

            try {
                console.log(`${HSNs[0].HSN} ::: MAIN ::: Fetching HTML`)

                const $ = await fetchHTML(HSNs[0].HSN)

                console.log(`${HSNs[0].HSN} ::: MAIN ::: HTML Fetched`)

                const headers = ['HSN', 'description', 'unit', 'standardDuty', 'professionalAreaDuty']

                const HSNDetails = []

                $("tr").each(function() {
                    const totalTd = $(this).find('td').length
                    if (totalTd === 5) {
                        const obj = {}
                        $(this).find('td').each(function(index, ele) {
                            if (index === 0) {
                                const totalInput = $(this).find('input').length
                                obj[headers[index]] = totalInput !== 0 ? $(this).find('input').val() : $(this).text()
                                obj.isSubHead = totalInput === 0
                            } else {
                                obj[headers[index]] = $(this).text()
                            }
                        })
                        HSNDetails.push(obj)
                    }
                })

                for (let HSNDetail of HSNDetails) {
                    const existingHSNs = await knex.select('id', 'detailsStatus').from('importExport').where({HSN: HSNDetail.HSN})
                    if (existingHSNs.length && existingHSNs[0].detailsStatus !== 'SUCCESS') {
                        await knex('importExport').where({id: existingHSNs[0].id}).update({
                            detailsStatus: 'SUCCESS',
                            description: HSNDetail.description,
                            unit: HSNDetail.unit,
                            standardDuty: HSNDetail.standardDuty,
                            professionalAreaDuty: HSNDetail.professionalAreaDuty
                        })

                        console.log(`${HSNDetail.HSN} ::: MAIN ::: HSN Details Updated`)
                    }
                }

                const t1 = performance.now()

                console.log(`${HSNs[0].HSN} ::: SUCCESS Time took ${((t1 - t0) / 1000)} seconds.`)
            } catch (err) {
                const t1 = performance.now()

                await knex('importExport').where({id: HSNs[0].id}).update({
                    detailsStatus: 'FAILED'
                })

                console.log(`${HSNs[0].HSN} ::: FAILED Time took ${((t1 - t0) / 1000)} seconds.`, err)
            }
        }
    }
})()