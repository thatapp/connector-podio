var Podio = require('../../../podio');

const helper = require('../../../helpers/itemHelper');

exports.process = async function getFilesbyApp(msg, cfg) {
    const that = this;
    const item = msg.body;
    const podio = new Podio(cfg);

    let offset = 0;
    let i = 0;

    const increment = 100;

    const items_data = [];
    const fields = item;
    console.log(JSON.stringify(fields));
    let count;
    if (!item.limit) {
        do {
            offset = i * increment;
            fields.limit = increment;
            fields.offset = offset;
            const items = await podio.get('/file/app/' + item.app_id, fields);
            count = items.length;
            console.log(items);
            //split the data
            var item_data_ = items;
            item_data_.forEach(function (value) {
                items_data.push(value);
            });
            i++;
        } while (count == increment);
    } else {
        fields.limit = item.limit;
        const items = await podio.get('/file/app/' + item.app_id, fields);
        var item_data_ = items;
        item_data_.forEach(function (value) {
            items_data.push(value);
        });
    }
    helper.emitData(cfg, items_data, that);
};

// Answers a Podio hook validation before normal processing (GitLab #476).
exports.process = require('../../../helpers/hookVerify').guard(exports.process);
