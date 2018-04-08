import { gridState } from './gridState';
import { createGridInstanceFunctions } from './gridInstanceFunctions';
import { viewGenerator } from './viewGenerator';
import { general_util } from './general_util';
import { getInitialGridData } from './pageRequests';

var grid = Object.defineProperties(
    {}, {
        'getGridInstance': {
            value: function getGridInstance(elem) {
                elem = $(elem);
                return gridState.filter(gs => elem[0] === gs.grid[0]).grid;
            },
            writable: false,
            configurable: false
        },
        'createGrid': {
            get: function create(gridData, gridElem) {
                if (gridData && isDomElement(gridElem)) {
                    //TODO: clean this tmp code up once jsHint will stop screaming
                    /*var im = 2;
                    if (!gridData) {
                        var tmp = DataStore(gridData);
                        im = tmp.getGridInstance();
                    }
                    var id = gridState.generateId(im);
                    */

                    var gridConfig = initializeConfig(gridData, gridElem),
                        instanceId = gridState.createInstance(gridConfig);

                    gridElem = $(gridElem).addClass('grid_elem');

                    var wrapperDiv = $('<div id="grid-wrapper-' + instanceId + '" data-grid_id="' + instanceId + '" class="grid-wrapper"></div>').appendTo(gridElem);
                    var headerDiv = $('<div id="grid-header-' + instanceId + '" data-grid_header_id="' + instanceId + '" class="grid-header-div"></div>').appendTo(wrapperDiv);
                    headerDiv.append('<div class="grid-header-wrapper"></div>');
                    wrapperDiv.append('<div id="grid-content-' + instanceId + '" data-grid_content_id="' + instanceId + '" class="grid-content-div"></div>');
                    //wrapperDiv.append('<div id="grid-footer-' + id + '" data-grid_footer_id="' + id + '" class=grid-footer-div></div>');
                    wrapperDiv.append('<div id="grid-pager-' + instanceId + '" data-grid_pager_id="' + instanceId + '" class="grid-pager-div"></div>');
                    gridElem[0].grid = {};

                    createGridInstanceFunctions(gridElem, instanceId);

                    (gridConfig.useValidator === true && window.validator && typeof validator.setAdditionalEvents === general_util.jsTypes.function) ?
                        validator.setAdditionalEvents(['blur', 'change']) : gridConfig.useValidator = false;

                    viewGenerator.createHeaders(gridConfig, gridElem);
                    getInitialGridData(gridConfig.dataSource, gridConfig.pageSize || 25, function initialGridDataCallback(err, res) {
                        if (!err) {
                            gridConfig.dataSource.data = res.data;
                            gridConfig.dataSource.rowCount = general_util.isInteger(res.rowCount) ? res.rowCount : res.data.length;
                            if (res.aggregations && gridConfig.dataSource.aggregates) {
                                gridConfig.dataSource.aggregates = gridConfig.dataSource.aggregates.map(function _mapAggregateValues(val) {
                                    if (res.aggregations[val.field])
                                        return { aggregate: val.aggregate, field: val.field, value: res.aggregations[val.field] };
                                    else return { aggregate: val.aggregate, field: val.field, value: null };
                                });
                            }
                        }
                        else {
                            gridConfig.dataSource.data = {};
                            gridConfig.dataSource.rowCount = 0;
                        }
                        setOriginalData(gridConfig);

                        var eventObj = { element: gridConfig.grid };
                        callGridEventHandlers(gridConfig.events.beforeDataBind, gridConfig.grid, eventObj);
                        createGridPager(gridConfig, gridElem);
                        viewGenerator.createContent(gridConfig, gridElem);
                        callGridEventHandlers(gridConfig.events.afterDataBind, gridConfig.grid, eventObj);
                    });
                }
                return gridElem[0].grid;
            }
        }
    }
);

/**
 * Initializes an instance of the grid after retrieving the dataSource data.
 * Sets the internal instance of the grid's data, calls to create the footer and content
 * @method initializeGrid
 * @for grid
 * @private
 * @param {object} gridConfig
 * @param {object} gridElem
 */
function initializeConfig(gridConfig, gridElem) {
    var storageData = cloneGridData(gridData);

    storageData.columnIndices = {};
    storageData.columns.forEach(function _createColumnIndices(col, idx) {
        storageData.columnIndices[col.field] = idx;
    });
    storageData.useFormatter = gridConfig.useFormatter === true && window.formatter && typeof formatter.getFormattedInput === general_util.jsTypes.function;

    storageData.events = {
        beforeCellEdit: typeof storageData.beforeCellEdit === 'object' && storageData.beforeCellEdit.constructor === Array ? storageData.beforeCellEdit : [],
        cellEditChange: typeof storageData.cellEditChange === 'object' && storageData.cellEditChange.constructor === Array ? storageData.cellEditChange : [],
        afterCellEdit: typeof storageData.afterCellEdit === 'object' && storageData.afterCellEdit.constructor === Array ? storageData.afterCellEdit : [],
        pageRequested: typeof storageData.pageRequested === 'object' && storageData.pageRequested.constructor === Array ? storageData.pageRequested : [],
        beforeDataBind: typeof storageData.beforeDataBind === 'object' && storageData.beforeDataBind.constructor === Array ? storageData.beforeDataBind : [],
        afterDataBind: typeof storageData.afterDataBind === 'object' && storageData.afterDataBind.constructor === Array ? storageData.afterDataBind : [],
        columnReorder: typeof storageData.columnReorder === 'object' && storageData.columnReorder.constructor === Array ? storageData.columnReorder : []
    };

    delete storageData.beforeCellEdit;
    delete storageData.cellEditChange;
    delete storageData.afterCellEdit;
    delete storageData.pageRequested;
    delete storageData.beforeDataBind;
    delete storageData.afterDataBind;
    delete storageData.columnReorder;

    storageData.pageNum = gridConfig.pageNum || 1;
    storageData.pageSize = gridConfig.pageSize || 25;
    storageData.grid = gridElem;
    storageData.currentEdit = {};
    storageData.pageRequest = {};
    storageData.putRequest = {};
    storageData.resizing = false;
    storageData.sortedOn = [];
    storageData.basicFilters = { conjunct: 'and', filterGroup: null };
    storageData.advancedFilters = {};
    storageData.filters = {};
    storageData.groupedBy = [];
    storageData.gridAggregations = {};

    storageData.advancedFiltering = storageData.filterable ? storageData.advancedFiltering : false;
    if (typeof storageData.advancedFiltering === general_util.jsTypes.object) {
        storageData.advancedFiltering.groupsCount = general_util.isInteger(storageData.advancedFiltering.groupsCount) ? storageData.advancedFiltering.groupsCount : 5;
        storageData.advancedFiltering.filtersCount = general_util.isInteger(storageData.advancedFiltering.filtersCount) ? storageData.advancedFiltering.filtersCount : 10;
    }

    storageData.parentGridId = gridData.parentGridId != null ? gridData.parentGridId : null;
    if (storageData.dataSource.rowCount == null) storageData.dataSource.rowCount = gridConfig.dataSource.data.length;

    return storageData;
}

function setOriginalData(gridConfig) {
    gridConfig.originalData = cloneGridData(gridConfig.dataSource.originalData);
    delete gridConfig.dataSource.originalData;
    return gridConfig;
}