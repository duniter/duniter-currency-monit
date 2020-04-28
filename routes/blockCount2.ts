import {DBBlock} from 'duniter/app/lib/db/DBBlock'
import {DataFinder} from '../lib/DataFinder'
import {showExecutionTimes} from '../lib/MonitorExecutionTime'
import {MonitConstants} from "../lib/constants2";

const fs = require('fs')
const timestampToDatetime = require(__dirname + '/../lib/timestampToDatetime')
const colorScale = require(__dirname + '/../lib/colorScale')
const getLang = require(__dirname + '/../lib/getLang')

// Garder l'index des blocs en mémoire vive
var blockchain: DBBlock[] = [];
var hashPreviousCurrentblock = '';
var previousBlockchainTime = 0;

module.exports = async (req: any, res: any, next: any) => {

    var {monitDatasPath} = req.app.locals

    const dataFinder = await DataFinder.getInstanceReindexedIfNecessary()

    try {
        // get GET parameters
        var begin = req.query.begin >= 0 && req.query.begin || 0; // Default begin Value is zero
        var end = req.query.end >= 0 && req.query.end || -1; // Default Value is -1 (=current block)
        var format = req.query.format || 'HTML';
        var help = req.query.help || 'yes';
        var data = req.query.data || 'nbBlocks';
        var perNode = (req.query.perNode == 'yes') ? 'yes' : 'no';
        var significantPercent = req.query.significantPercent || 3;

        // get lg file
        const LANG = getLang(`${__dirname}/../lg/blockCount_${req.query.lg || MonitConstants.DEFAULT_LANGUAGE}.txt`);

        // detect fork
        if (blockchain.length > 0) {
            let newHashPreviousCurrentblock = (await dataFinder.getCurrentBlockOrNull() as { hash: string }).hash
            if (hashPreviousCurrentblock != newHashPreviousCurrentblock) {
                blockchain.splice(0, blockchain.length);
                hashPreviousCurrentblock = '';
                previousBlockchainTime = 0;
            }
        }

        // get endBlock
        var endBlock = await dataFinder.getBlock(end) as DBBlock // Sure?

        // get new blocks
        var newBlocks = [];
        if (end < 0) {
            newBlocks = await dataFinder.getBlockWhereMedianTimeGt(previousBlockchainTime)
            blockchain = blockchain.concat(newBlocks);
        } else if (end > blockchain.length) {
            newBlocks = await dataFinder.getBlockWhereMedianTimeLteAndGt(endBlock.medianTime, previousBlockchainTime)

            for (let i = 0; i < newBlocks.length; i++) {
                blockchain.push(newBlocks[i]);
            }
        }

        // stock hashPreviousCurrentblock and previousBlockchainTime
        let tmpCurrentBlock = await dataFinder.getCurrentBlockOrNull() as DBBlock
        hashPreviousCurrentblock = tmpCurrentBlock.hash;
        previousBlockchainTime = tmpCurrentBlock.medianTime;

        // fix end
        if (end == -1) {
            end = blockchain.length - 1;
        }

        // get idtys list
        var idtys = await dataFinder.getMembers();

        // create and initialize tabBlockMembers, tabBlockCountPerNode and tabDataPerNode
        var tabBlockMembers: BlockMember[] = [];
        var tabCoreCountPerNode: number[][] = [];
        var tabBlockCountPerNode = [];
        var tabDataPerNode = [];
        var maxIdNode = 1;
        for (let i = 0; i < idtys.length; i++) {
            let tmpBecomeMember = idtys[i].written_on.split("-");
            tabBlockMembers.push({
                uid: idtys[i].uid,
                pubkey: idtys[i].pub,
                becomeMember: (tmpBecomeMember[0] > begin) ? tmpBecomeMember[0] : begin,
                coreCount: 0,
                blockCount: 0,
                data: 0
            });
            // initialize tabBlockCountPerNode and tabDataPerNode
            if (perNode == 'yes') {
                tabCoreCountPerNode.push(new Array());
                tabBlockCountPerNode.push(new Array());
                tabDataPerNode.push(new Array());
            }
        }

        // cgeek: extracted code from this "if" block, otherwise first call to the page does not answer
        // // full tabBlockCountPerNode and tabDataPerNode with zero
        if (perNode == 'yes') {
            for (let m = 0; m < tabBlockMembers.length; m++) {
                for (let n = 0; n < 9; n++) {
                    tabCoreCountPerNode[m].push(0);
                    tabBlockCountPerNode[m].push(0);
                    if (data == 'meanNonce') {
                        tabDataPerNode[m].push(0);
                    }
                }
            }
        }

        //
        if (data == "currentFrame") {

        }

        // Open a write stream into a new calculators_rank file
        let pathToCalculatorsRankFile = monitDatasPath + 'calculators_rank/'
        let calculatorsRankFilename = 'calculators_rank_' + Date.now() + '.csv'
        if (!fs.existsSync(pathToCalculatorsRankFile)) {
            fs.mkdirSync(pathToCalculatorsRankFile)
        }
        var ws = fs.createWriteStream(pathToCalculatorsRankFile + calculatorsRankFilename, {
            flags: 'a',
            encoding: 'utf8',
            fd: null,
            mode: 0o666,
            autoClose: true
        });

        // Calculate the sum of blocks and their nonce and number of core
        let calculatorsCount = 1;
        for (let b = begin; b < blockchain.length; b++) {
            for (let m = 0; m < tabBlockMembers.length; m++) {
                if (tabBlockMembers[m].pubkey == blockchain[b].issuer) {
                    if (tabBlockMembers[m].blockCount == 0) {
                        //console.log("%s, %s, #%s, %s", calculatorsCount, tabBlockMembers[m].uid, b, timestampToDatetime(blockchain[b].medianTime));
                        ws.write(calculatorsCount + ', ' + tabBlockMembers[m].uid + ', #' + b + ', ' + timestampToDatetime(blockchain[b].medianTime) + '\r\n');
                        calculatorsCount++;
                    }

                    tabBlockMembers[m].blockCount++;
                    let nonce = parseInt((blockchain[b].nonce).toString().substr(3));
                    if (data == 'meanNonce') {
                        tabBlockMembers[m].data += nonce;
                    }

                    let idCore = parseInt((blockchain[b].nonce).toString().substr(1, 2));
                    tabBlockMembers[m].coreCount = (tabBlockMembers[m].coreCount < idCore) ? idCore : tabBlockMembers[m].coreCount;

                    let idNode = parseInt((blockchain[b].nonce).toString().substr(0, 1));
                    if (perNode == 'yes') {
                        maxIdNode = (idNode > maxIdNode) ? idNode : maxIdNode;
                        tabCoreCountPerNode[m][idNode - 1] = (tabCoreCountPerNode[m][idNode - 1] < idCore) ? idCore : tabCoreCountPerNode[m][idNode - 1];
                        tabBlockCountPerNode[m][idNode - 1]++;
                        if (data == 'meanNonce') {
                            tabDataPerNode[m][idNode - 1] += nonce;
                        }
                    }
                }
            }
        }

        // Close write stream into calculators_rank file
        ws.end();

        // Remove oldest calculators_rank file
        let files = fs.readdirSync(pathToCalculatorsRankFile);
        if (files.length > 10) {
            let minTimestamp = Date.now()
            for (let file of files) {
                let fileTimestamp = parseInt(file.split('_')[2])
                if (fileTimestamp < minTimestamp) {
                    minTimestamp = fileTimestamp;
                }
            }
            fs.unlink(pathToCalculatorsRankFile + 'calculators_rank_' + minTimestamp + '.csv', function (err: any) {
                if (err) return console.log(err);
            });
        }

        // Delete non-significant nodes
        // A node is considered as significant if its blockCount represents more than 3 % of the total member blockCount
        var maxSignificantIdNode = 1;
        if (perNode == 'yes') {
            for (let m = 0; m < tabBlockMembers.length; m++) {
                let significantLimit = tabBlockMembers[m].blockCount * significantPercent / 100
                for (let n = 0; n < maxIdNode; n++) {
                    if (tabBlockCountPerNode[m][n] <= significantLimit) {
                        tabBlockMembers[m].blockCount -= tabBlockCountPerNode[m][n];
                        tabCoreCountPerNode[m][n] = 0;
                        tabBlockCountPerNode[m][n] = 0;
                        if (data == 'meanNonce') {
                            tabBlockMembers[m].data -= tabDataPerNode[m][n];
                            tabDataPerNode[m][n] = 0;
                        }
                    } else if (tabBlockCountPerNode[m][n] > 0) {
                        maxSignificantIdNode = ((n + 1) > maxSignificantIdNode) ? (n + 1) : maxSignificantIdNode;
                    }
                }
            }
        }

        // calculate data (writtenPercent or meanNonce or writtenPercentSinceBecomeMember or
        for (let m = 0; m < tabBlockMembers.length; m++) {
            if (data == 'nbBlocks') {
                tabBlockMembers[m].data = tabBlockMembers[m].blockCount;
                if (perNode == 'yes') {
                    for (let n = 0; n < maxSignificantIdNode; n++) {
                        tabDataPerNode[m].push(tabBlockCountPerNode[m][n]);
                    }
                }
            } else if (data == 'writtenPercent') {
                tabBlockMembers[m].data = parseFloat(((tabBlockMembers[m].blockCount * 100) / (blockchain.length - begin)).toFixed(2));
                if (perNode == 'yes') {
                    for (let n = 0; n < maxSignificantIdNode; n++) {
                        tabDataPerNode[m].push(parseFloat(((tabBlockCountPerNode[m][n] * 100) / (blockchain.length - begin)).toFixed(2)));
                    }
                }
            } else if (data == 'meanNonce' && tabBlockMembers[m].blockCount > 0) {
                tabBlockMembers[m].data = parseInt((tabBlockMembers[m].data / (tabBlockMembers[m].blockCount)).toFixed(0));
                if (perNode == 'yes') {
                    for (let n = 0; n < maxSignificantIdNode; n++) {
                        tabDataPerNode[m][n] = parseInt((tabDataPerNode[m][n] / (tabBlockCountPerNode[m][n])).toFixed(0));
                    }
                }
            } else if (data == 'writtenPercentSinceBecomeMember') {
                let nbBlockwithThisMember = (tabBlockMembers[m].becomeMember > begin) ? (blockchain.length - tabBlockMembers[m].becomeMember) : (blockchain.length - begin);
                tabBlockMembers[m].data = parseFloat(((tabBlockMembers[m].blockCount * 100) / nbBlockwithThisMember).toFixed(2));
                if (perNode == 'yes') {
                    for (let n = 0; n < maxSignificantIdNode; n++) {
                        tabDataPerNode[m].push(parseFloat(((tabBlockCountPerNode[m][n] * 100) / nbBlockwithThisMember).toFixed(2)));
                    }
                }
            }
        }

        // trier le tableau par ordre croissant de data
        var tabBlockMembersSort: BlockMemberWithPerNode[] = []
        var tabExcluded = [];
        for (let m = 0; m < tabBlockMembers.length; m++) {
            let max = -1;
            let idMax = 0;
            for (let m2 = 0; m2 < tabBlockMembers.length; m2++) {
                if (tabBlockMembers[m2].data > max) {
                    let exclude = false;
                    for (let e = 0; e < tabExcluded.length; e++) {
                        if (tabExcluded[e] == tabBlockMembers[m2].uid) {
                            exclude = true;
                        }
                    }
                    if (!exclude) {
                        max = tabBlockMembers[m2].data;
                        idMax = m2;
                    }
                }
            }
            tabBlockMembersSort.push({
                uid: tabBlockMembers[idMax].uid,
                pubkey: tabBlockMembers[idMax].pub || tabBlockMembers[idMax].pubkey, // 'pub' maybe a bug?
                becomeMember: tabBlockMembers[idMax].becomeMember,
                coreCount: tabBlockMembers[m].coreCount,
                coreCountPerNode: (perNode == 'yes') ? tabCoreCountPerNode[idMax] : null,
                blockCount: tabBlockMembers[idMax].blockCount,
                blockCountPerNode: (perNode == 'yes') ? tabBlockCountPerNode[idMax] : null,
                data: tabBlockMembers[idMax].data,
                dataPerNode: (perNode == 'yes') ? tabDataPerNode[idMax] : null
            });
            tabExcluded.push(tabBlockMembers[idMax].uid);
        }

        //define dataLabel
        var dataLabel = '#' + LANG['WRITTEN_BLOCKS'];
        if (data == 'writtenPercent') {
            dataLabel = "\% " + LANG['BLOCKCHAIN'];
        } else if (data == 'writtenPercentSinceBecomeMember') {
            dataLabel = "\% " + LANG['BLOCKCHAIN'] + " (" + LANG['SINCE_BECOME_MEMBER'] + ")";
        } else if (data == 'meanNonce') {
            dataLabel = '#' + LANG['MEAN_NONCE'];
        }

        showExecutionTimes()

        // Si le client demande la réponse au format JSON, le faire
        if (format == 'JSON')
            res.status(200).jsonp(tabBlockMembersSort)
        else {
            // Formatting data
            var tabLabels = [];
            var tabDataX = [];
            var tabDataXperNode: number[][] = [];
            var tabBackgroundColor = [];
            var tabBorderColor = [];
            var tabHoverBackgroundColor = [];
            var nbMembers = 0;
            for (let n = 0; n < maxIdNode; n++) {
                tabDataXperNode.push(new Array());
            }
            for (let m = 0; m < tabBlockMembersSort.length; m++) {
                if (tabBlockMembersSort[m].data > 0) {
                    if (perNode == 'yes') {
                        tabLabels.push(tabBlockMembersSort[m].uid + "(");
                        for (let n = 0; n < maxSignificantIdNode; n++) {
                            tabDataXperNode[n].push((tabBlockMembersSort[m].dataPerNode as number[])[n]);
                            if ((tabBlockMembersSort[m].coreCountPerNode as number[])[n] > 0) {
                                tabLabels[tabLabels.length - 1] += (tabBlockMembersSort[m].coreCountPerNode as number[])[n] + "c,";
                            }
                        }
                        tabLabels[tabLabels.length - 1] = tabLabels[tabLabels.length - 1].substr(0, tabLabels[tabLabels.length - 1].length - 1);
                        tabLabels[tabLabels.length - 1] += ")";
                    } else {
                        tabLabels.push(tabBlockMembersSort[m].uid);
                        tabDataX.push(tabBlockMembersSort[m].data);
                    }
                    nbMembers++;
                }
            }

            var datasets: any[] = [];
            if (perNode == 'yes') {
                for (let n = 0; n < maxSignificantIdNode; n++) {
                    datasets.push({
                        label: dataLabel,
                        data: tabDataXperNode[n],
                        backgroundColor: colorScale(nbMembers, 0.5),
                        borderWidth: 0,
                        hoverBackgroundColor: colorScale(nbMembers, 0.2)
                    });
                }
            } else {
                datasets = [{
                    label: dataLabel,
                    data: tabDataX,
                    backgroundColor: colorScale(nbMembers, 0.5),
                    borderColor: colorScale(nbMembers, 1.0),
                    borderWidth: 1,
                    hoverBackgroundColor: colorScale(nbMembers, 0.2),
                    hoverBorderColor: colorScale(nbMembers, 0.2)
                }];
            }

            res.locals = {
                host: req.headers.host.toString(),
                tabBlockMembersSort,
                begin,
                end,
                help,
                data,
                perNode,
                description: ``,
                chart: {
                    type: 'bar',
                    data: {
                        labels: tabLabels,
                        datasets: datasets
                    },
                    options: {
                        title: {
                            display: true,
                            text: nbMembers + ' ' + LANG["RANGE"] + ' #' + begin + '-#' + end
                        },
                        legend: {
                            display: false
                        },
                        scales: {
                            yAxes: [{
                                ticks: {
                                    beginAtZero: true,
                                }
                            }]
                        },
                        categoryPercentage: 1.0,
                        barPercentage: 1.0
                    }
                },
                form: `${LANG['BEGIN']} #<input type='number' name='begin' value='${begin}' size='7' style='width:60px;'> - ${LANG['END']} #<input type='number' name='end' value='${end}' size='7' style='width:60px;'>
            <select name='data'>
              <option name='data' value ='nbBlocks'>${LANG["NB_BLOCKS"]}
              <option name='data' value ='writtenPercent' ${data == 'writtenPercent' ? 'selected' : ''}>${LANG["PERCENT_OF_WRITTEN_BLOCKS"]}
              <option name='data' value ='writtenPercentSinceBecomeMember' ${data == 'writtenPercentSinceBecomeMember' ? 'selected' : ''}>${LANG["PERCENT_OF_WRITTEN_BLOCKS"]} ${LANG["SINCE_BECOME_MEMBER"]}
              <option name='data' value ='meanNonce' ${data == 'meanNonce' ? 'selected' : ''}>${LANG['MEAN_NONCE']}
              <option name='data' value ='currentFrame' ${data == 'currentFrame' ? 'selected' : ''}>${LANG['CURRENT_FRAME']}
            </select>
            <input type='checkbox' name='perNode' value='yes' ${perNode == 'yes' ? 'checked' : ''}>${LANG['DETAIL_BY_NODE']} - 
            ${LANG['SIGNIFICANT_LIMIT']} <input type='number' name='significantPercent' value='${significantPercent}' size='2' style='width:30px;'>${LANG['PERCENT_OF_BLOCKS']}`
            }
            next()
        }
    } catch (e) {
        // En cas d'exception, afficher le message
        console.error(e)
        res.status(500).send(`<pre>${e.stack || e.message}</pre>`);
    }
}

interface BlockMember {
    uid: string
    pub?: string
    pubkey: string
    becomeMember: number
    coreCount: number
    blockCount: number
    data: number
    coreCountPerNode?: number[] | null
    blockCountPerNode?: number[] | null
    dataPerNode?: number[] | null
}

interface BlockMemberWithPerNode extends BlockMember {
    coreCountPerNode: number[] | null
    blockCountPerNode: number[] | null
    dataPerNode: number[] | null
}
