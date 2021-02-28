const AWS = require("aws-sdk");
AWS.config.update({region: "ap-northeast-1"});
var translate = new AWS.Translate();

exports.test = function resolveAfter2Seconds(params) {
        return new Promise(resolve => {
        setTimeout(() => {
            translate.translateText(params, function (err, data) {
                if (err){
                    console.log(err, err.stack);
                }
                else{
                resolve(data['TranslatedText']);
                }
            });
        }, 1000);
    });      
}