var Podio = require('../../../podio');
const {messages} = require('../../../helpers/messages');
const helper = require('../../../helpers/itemHelper');

exports.process = async function getAllApp(msg, cfg) {
    var that = this;
    var item = msg.body;
    var podio = new Podio(cfg);


    var fields = {};
    if(item.exclude_app_ids){
        fields.exclude_app_ids = item.exclude_app_ids;
    }
    if(item.exclude_demo){
        fields.exclude_demo = item.exclude_demo;
    }
    if(item.limit){
        fields.limit = item.limit;
    }
    if(item.order){
        fields.order = item.order;
    }

    if(item.referenceable_in_org){
        fields.referenceable_in_org = item.referenceable_in_org;
    }

    if(item.target_space_id){
        fields.target_space_id = item.target_space_id;
    }

    if(item.text){
        fields.text = item.text;
    }


    try {
        const items = await podio.get('/app/', fields);
        helper.emitData(cfg, items, that);
    } catch (err) {
        that.emit('error', err);
    }
};

