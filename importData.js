const axios = require("axios")
const cheerio = require("cheerio")
const qs = require('qs');
const puppeteer = require('puppeteer')
const Drive = require('./drive')
const cluster = require('cluster')
const mysql      = require('mysql')
const util = require('util')
const { performance } = require('perf_hooks');
const { Agent } = require("http");

const drive = new Drive()

drive.useServiceAccount()

Number.prototype.pad = function(size) {
    var s = String(this);
    while (s.length < (size || 2)) {s = s + "0";}
    return s;
}

async function fetchHTML(code) {
    const postData = qs.stringify({
        'cntrycd': '',
        'cth': code
    });

    var config = {
        method: 'post',
        url: 'https://www.icegate.gov.in/Webappl/Structure-of-Duty-for-selected-Tariff',
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
          'Referer': 'https://www.icegate.gov.in/Webappl/Tariff-head-details', 
          'Accept-Language': 'en-GB,en-US;q=0.9,en;q=0.8', 
          'Cookie': 'JSESSIONID=25590019F9042162DDCE4627D9ABF596; TS015cbc79=016b3f3df4bbd853255cb48d1bdca9f9287805794ed47173c627bde37ca92735919c1a73171492eecdd62dcefb1bc6562f14a744d6; style=blue; TS013f8d96=016b3f3df44cd58695449747854dc97d40703679b2bd69ff80337a1e61904216203586a13d787ba606906c40163de799b1727cfdfa'
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
            clusterLaunch.on('exit', async (worker, code, signal) => {
                console.log(`worker died`);
    
                await launchCluster()
            });
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

            function pad(num, size) {
                num = num.toString();
                while (num.length < size) num = num + "0";
                return parseInt(num);
            }

            const browser = await puppeteer.launch({
                defaultViewport: null,
                headless: true,
                args: ['--no-sandbox']
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

                    const $ = await fetchHTML(pad(parseInt(HSN.HSN), 8))

                    console.log(`${HSN.HSN} ::: MAIN ::: HTML Fetched`)

                    const fetchedHSN = parseInt($('body > center > div > center > b:nth-child(6) > font').text().replace("Structure of Duty for CTH :", ""))

                    console.log(`${pad(parseInt(HSN.HSN), 8)} ${fetchedHSN} ::: MAIN ::: Fetched HSN`)

                    if (fetchedHSN !== pad(parseInt(HSN.HSN), 8)) {
                        const t1 = performance.now()

                        await query(`UPDATE importExport SET status = ? WHERE id IN (?)`, ['WRONG HSN', HSN.id])

                        console.log(`${HSN.HSN} ::: WRONG HSN Time took ${((t1 - t0) / 1000)} seconds.`)

                        continue
                    }

                    $('img').remove()

                    $('body > center > form > right > input[type=submit]').remove()

                    $('body > center > form > right > right > table:nth-child(20)').remove()

                    const value = $('*:contains("Enter your Assessable value in INR")')
                    value.eq(value.length - 3).css('display', 'none')

                    let replaced = $("body").html().replace('Enter your Assessable value and press Enter','');
                    replaced = replaced.replace('Enter Qty if Applicable','');
                    $("body").html(replaced);

                    $('tr').each(function () {
                        if ($(this).find('th').length === 9) {
                            $(this).find('th').eq(4).remove()
                        } else if ($(this).find('td').length === 9) {
                            $(this).find('td').eq(4).remove()
                        }
                    })

                    console.log(`${HSN.HSN} ::: MAIN ::: Document Structure Ready`)

                    const page = await browser.newPage();

                    await page.setContent($.html());

                    await page.addScriptTag({ path: require.resolve('./jquery-3.2.1.min.js') });

                    await page.evaluate(() => {
                        $('input').each(function () {
                            if(!$(this).is('[type="hidden"]')) {
                                $(this).css('display', 'none')
                                $(`<b style="color:#000066;font-family:Verdana,Arial, Helvetica, sans-serif;font-size:small;font-weight: 300;"> ${this.value} </b>`).insertAfter($(this).closest('b'))
                            }
                        })
                    })

                    console.log(`${HSN.HSN} ::: MAIN ::: Document PDF Generating`)

                    await page.pdf({
                        displayHeaderFooter: false,
                        path: `uploads1/${HSN.HSN}.pdf`,
                        format: 'A3',
                        printBackground: true
                    })

                    await page.close();

                    console.log(`${HSN.HSN} ::: MAIN ::: Document PDF Generated`)

                    console.log(`${HSN.HSN} ::: MAIN ::: Uploading PDF`)

                    const pdfUrl = await drive.uploadFile(`uploads1/${HSN.HSN}.pdf`, true)

                    console.log(`${HSN.HSN} ::: MAIN ::: PDF Uploaded`)

                    await query(`UPDATE importExport SET status = ?, importImage = ? WHERE id IN (?)`, ['SUCCESS', pdfUrl, HSN.id])

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