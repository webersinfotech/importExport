const axios = require("axios")
const cheerio = require("cheerio")
const qs = require('qs');
const puppeteer = require('puppeteer')
const Drive = require('./drive')
const cluster = require('cluster')
const mysql      = require('mysql')
const util = require('util')
const { performance } = require('perf_hooks');

const drive = new Drive()

drive.useServiceAccount()

async function fetchHTML(code) {
    const postData = qs.stringify({
        'cth': code
    });

    var config = {
        method: 'post',
        url: 'https://www.icegate.gov.in/Webappl/Details-for-selected-ITCHS',
        headers: { 
          'Connection': 'keep-alive', 
          'Cache-Control': 'max-age=0', 
          'sec-ch-ua': '"Google Chrome";v="93", " Not;A Brand";v="99", "Chromium";v="93"', 
          'sec-ch-ua-mobile': '?0', 
          'sec-ch-ua-platform': '"macOS"', 
          'Upgrade-Insecure-Requests': '1', 
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/93.0.4577.63 Safari/537.36', 
          'Origin': 'https://www.icegate.gov.in', 
          'Content-Type': 'application/x-www-form-urlencoded', 
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9', 
          'Sec-Fetch-Site': 'same-origin', 
          'Sec-Fetch-Mode': 'navigate', 
          'Sec-Fetch-User': '?1', 
          'Sec-Fetch-Dest': 'document', 
          'Referer': 'https://www.icegate.gov.in/Webappl/Trade-Guide-on-Export', 
          'Accept-Language': 'en-GB,en-US;q=0.9,en;q=0.8', 
          'Cookie': 'JSESSIONID=7ECDA26E3A223D9775AD77019F0D102B; TS015cbc79=016b3f3df4c1c6639d4d635a903af0595e926f9c02ff61484c0e4f2b858d60efae04e2a5f7b15db9df19fad81c23bf7734b6f678d4; style=blue; TS013f8d96=016b3f3df4c1c6639d4d635a903af0595e926f9c02ff61484c0e4f2b858d60efae04e2a5f7b15db9df19fad81c23bf7734b6f678d4'
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

        const connections = new Array(7).fill(0)

        for (let [index, connection] of connections.entries()) {
            await launchCluster()
        }

        async function launchCluster() {
            const clusterLaunch = cluster.fork()
            // clusterLaunch.on('exit', async (worker, code, signal) => {
            //     console.log(`worker died`);
    
            //     await launchCluster()
            // });
            await timeout(3000)
            return
        }
    } else {
        (async () => {
            drive.setDriveCurrentDirId('1psPDpkkEu-7c9r2yB50LFI_9hyj8HfrQ')

            const connection = mysql.createConnection({
                host:'google-account.cmlfk75xsv3h.ap-south-1.rds.amazonaws.com', 
                user: 'shahrushabh1996', 
                database: 'rapidTax',
                password: '11999966',
                ssl: 'Amazon RDS'
            })

            const query = util.promisify(connection.query).bind(connection)

            const browser = await puppeteer.launch({
                defaultViewport: null
            });

            let HSNs

            try {
                console.log('Transaction begin')

                await connection.beginTransaction()

                HSNs = await query(`SELECT * FROM importExport WHERE status = 'NOT STARTED' ORDER BY id ASC LIMIT 100`)

                console.log('HSNs Fetched')

                const HSNIds = []

                HSNs.map((HSN) => HSNIds.push(HSN.id))

                console.log('HSNs ID array ready', HSNIds)

                if (HSNIds.length) {
                    await query(`UPDATE importExport SET status = ? WHERE id IN (?)`, ['PROCESSING', HSNIds])
                }

                console.log('Updating status')
    
                await connection.commit()
            } catch (err) {
                console.log(err)
                connection.rollback()
            }

            for (let HSN of HSNs) {
                const t0 = performance.now()

                try {
                    console.log(`${HSN.HSN} ::: MAIN ::: Fetching HTML`)

                    const $ = await fetchHTML(HSN.HSN)

                    console.log(`${HSN.HSN} ::: MAIN ::: HTML Fetched`)

                    $('center').eq(1).remove()

                    $('img').remove()

                    $("left").nextAll("br").remove()

                    $('form').remove()

                    $("center br").eq(0).remove()

                    $("body").css({
                        'padding': '15px'
                    });

                    $('left').append(`<center style="margin-top: 20px"><font face="Verdana, Arial, Helvetica, sans-serif" size="4" color="darkblue"> Developed By <b> RapidTax </b> <br> India's Best Chartered Accountant Solution Provider <br> Contact : <a href="tel:+917990089984">+91-7990089984</a></font></center>`)

                    console.log(`${HSN.HSN} ::: MAIN ::: Document Structure Changed`)

                    const page = await browser.newPage();

                    await page.setContent($.html());

                    console.log(`${HSN.HSN} ::: MAIN ::: Document PDF Generating`)

                    await page.pdf({
                        path: `uploads/${HSN.HSN}.pdf`,
                        format: 'A3'
                    })

                    await page.close();

                    console.log(`${HSN.HSN} ::: MAIN ::: Document PDF Generated`)

                    console.log(`${HSN.HSN} ::: MAIN ::: Uploading PDF`)

                    const pdfUrl = await drive.uploadFile(`uploads/${HSN.HSN}.pdf`, true)

                    console.log(`${HSN.HSN} ::: MAIN ::: PDF Uploaded`)

                    await query(`UPDATE importExport SET status = ?, exportImage = ? WHERE id IN (?)`, ['SUCCESS', pdfUrl, HSN.id])

                    const t1 = performance.now()

                    console.log(`${HSN.HSN} ::: SUCCESS Time took ${((t1 - t0) / 1000)} seconds.`)
                } catch (err) {
                    const t1 = performance.now()

                    await query(`UPDATE importExport SET status = ? WHERE id IN (?)`, ['FAILED', HSN.id])

                    console.log(err)
    
                    console.log(`${HSN.HSN} ::: FAILED Time took ${((t1 - t0) / 1000)} seconds.`)
                }
            }

            connection.destroy()

            process.exit()
        })()
    }
})()