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

function pad(num, size) {
    num = num.toString();
    while (num.length < size) num = num + "0";
    return parseInt(num);
}

(async () => {
    let HSNs = await knex.select('id', 'HSN').from('importExport') // 85279919 540231
    console.log(HSNs.length)
    for (let HSN of HSNs) {
        let paddedHSN = await knex.select('id', 'HSN').from('importExport').where({HSN: pad(HSN.HSN, 8)})
        if (paddedHSN.length === 0) {
            console.log('Updating HSN', HSN.HSN, pad(HSN.HSN, 8))
            await knex('importExport').where({id: HSN.id}).update({
                HSN: pad(HSN.HSN, 8)
            })
        } else {
            console.log('Not Updating HSN', HSN.HSN, pad(HSN.HSN, 8))
        }
    }
    console.log('Process End')
})()