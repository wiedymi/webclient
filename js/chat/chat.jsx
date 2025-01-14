import React from "react";
import ReactDOM from "react-dom";
import ConversationsUI from "./ui/conversations.jsx";

// load chatRoom.jsx, so that its included in bundle.js, despite that ChatRoom is legacy ES ""class""
require("./chatRoom.jsx");

const EMOJI_DATASET_VERSION = 3;

var chatui;
var webSocketsSupport = typeof(WebSocket) !== 'undefined';

(function() {
    chatui = function(id) {
        var roomOrUserHash = id.replace("chat/", "");
        var isPubLink = id !== "chat/archived" && id.substr(0, 5) === "chat/" && id.substr(6, 1) !== "/";

        var roomType = false;
        var displayArchivedChats = false;
        if (roomOrUserHash === "archived") {
            roomType = "archived";
             displayArchivedChats = true;
             delete megaChat.lastOpenedChat;
        }
        else if (roomOrUserHash.substr(0, 2) === "g/" || roomOrUserHash.substr(0, 2) === "c/" || isPubLink) {
            roomType = (isPubLink || roomOrUserHash.substr(0, 2) === "c/") ? "public" : "group";

            var publicChatHandle;
            var publicChatKey;
            var publicChatId;
            if (roomType === "public" && isPubLink) {
                publicChatHandle = roomOrUserHash.split("#")[0];
                publicChatKey = roomOrUserHash.split("#")[1];
                // FB's ?fbclid stuff...
                if (publicChatKey && String(publicChatKey).indexOf("?") > -1) {
                    publicChatKey = publicChatKey.split("?")[0];
                }
                publicChatId = megaChat.handleToId[publicChatHandle];
                roomOrUserHash = publicChatHandle;

                megaChat.publicChatKeys = megaChat.publicChatKeys || {};
                megaChat.publicChatKeys[publicChatHandle] = publicChatKey;
            }
            else {
                roomOrUserHash = roomOrUserHash.substr(2, roomOrUserHash.length);
            }

            if (publicChatId && megaChat.chats[publicChatId]) {
                megaChat.chats[publicChatId].show();
            }
            else if (!megaChat.chats[roomOrUserHash]) {
                // chat not found
                // is it still loading?
                if (anonymouschat || publicChatHandle) {
                    // since openFolder is not getting called in this situation, setting M.chat is required
                    // to make previews work.

                    M.chat = true;

                    var promises = [];
                    if (!anonymouschat) {
                        promises.push(ChatdIntegration.mcfHasFinishedPromise);
                    }
                    MegaPromise.allDone(promises)
                        .always(function() {
                            megaChat.plugins.chatdIntegration.openChat(publicChatHandle)
                                .always(function () {
                                    if (anonymouschat) {
                                        ChatdIntegration.mcfHasFinishedPromise.resolve();
                                        ChatdIntegration.allChatsHadLoaded.resolve();
                                    }
                                    var publicChatId = megaChat.handleToId[publicChatHandle];
                                    if (megaChat.chats[publicChatId]) {
                                        megaChat.chats[publicChatId].show();
                                    }
                                });
                        });
                }
                else {
                    if (
                        ChatdIntegration._loadingChats[roomOrUserHash] &&
                        ChatdIntegration._loadingChats[roomOrUserHash].loadingPromise.state() === 'pending'
                    ) {
                        ChatdIntegration._loadingChats[roomOrUserHash].loadingPromise.done(function () {
                            chatui(id);
                        });
                        return;
                    }
                    setTimeout(function () {
                        loadSubPage('fm/chat');
                        M.openFolder('chat');
                    }, 100);
                }


                return;
            }
        }
        else {
            if (roomOrUserHash.substr(0, 2) === "p/") {
                roomOrUserHash = roomOrUserHash.substr(2);
            }
            if (!M.u[roomOrUserHash]) {
                setTimeout(function () {
                    loadSubPage('fm/chat');
                    M.openFolder('chat');
                }, 100);
                return;
            }
            else {
                roomType = "private";
            }
        }
        // XX: code maintanance: move this code to MegaChat.constructor() and .show(jid)
        M.hideEmptyGrids();

        $('.fm-files-view-icon').addClass('hidden');
        $('.fm-blocks-view').addClass('hidden');
        $('.files-grid-view').addClass('hidden');
        if (megaChat.displayArchivedChats) {
            $('.files-grid-view.archived-chat-view').removeClass('hidden');
        }
        $('.fm-right-account-block').addClass('hidden');
        $('.contacts-details-block').addClass('hidden');

        $('.shared-grid-view,.shared-blocks-view').addClass('hidden');

        if (roomType !== "archived") {
            $('.fm-right-files-block.in-chat').removeClass('hidden');
            $('.fm-right-files-block:not(.in-chat)').addClass('hidden');
        }

        megaChat.refreshConversations();

        if (roomType === "private") {
            var userHandle = id.split("chat/p/").pop();
            var userHandles = [
                u_handle,
                userHandle
            ];

            megaChat.smartOpenChat(userHandles, "private", undefined, undefined, undefined, true)
                .then(function(room) {
                    room.show();
                })
                .catch(function(ex) {
                    console.warn("openChat failed. Maybe tried to start a private chat with a non contact?", ex);
                });
        }
        else if(roomType === "group") {
            megaChat.chats[roomOrUserHash].show();
        }
        else if(roomType === "public") {
            if (megaChat.chats[roomOrUserHash] && id.indexOf('chat/') > -1) {
                megaChat.chats[roomOrUserHash].show();
            }

            else {
                var publicChatId = megaChat.handleToId[roomOrUserHash];

                if (publicChatId && megaChat.chats[publicChatId]) {
                    megaChat.chats[publicChatId].show();
                }
            }
        }
        else if(roomType === "archived") {
            megaChat.hideAllChats();
            M.onSectionUIOpen('conversations');
            $('.archived-chat-view').removeClass('hidden');
            if (megaChat.$conversationsAppInstance) {
                megaChat.safeForceUpdate();
            }
        }
        else {
            console.error("Unknown room type.");
            return;
        }

        if (displayArchivedChats !== megaChat.displayArchivedChats) {
            megaChat.displayArchivedChats = displayArchivedChats;
            megaChat.safeForceUpdate();
        }

        // since .fm-chat-block is out of the scope of the CovnersationsApp, this should be done manually :(
        $('.fm-chat-block').removeClass('hidden');
    };
})();


/**
 * Used to differentiate MegaChat instances running in the same env (tab/window)
 *
 * @type {number}
 */
var megaChatInstanceId = 0;


var CHATUIFLAGS_MAPPING = {
    'convPanelCollapse': 'cPC'
};

/**
 * MegaChat - UI component that links XMPP/Strophejs (via Karere) w/ the Mega's UI
 *
 * @returns {Chat}
 * @constructor
 */
var Chat = function() {
    var self = this;


    this.is_initialized = false;
    this.logger = MegaLogger.getLogger("chat");

    this.chats = new MegaDataMap();
    this.chatUIFlags = new MegaDataMap();
    this.initChatUIFlagsManagement();

    this.currentlyOpenedChat = null;
    this.lastOpenedChat = null;
    this.archivedChatsCount = 0;
    this._myPresence = localStorage.megaChatPresence;

    this._imageLoadCache = Object.create(null);
    this._imagesToBeLoaded = Object.create(null);
    this._imageAttributeCache = Object.create(null);
    this._queuedMccPackets = [];

    this.publicChatKeys = {};
    this.handleToId = {};

    this.options = {
        'delaySendMessageIfRoomNotAvailableTimeout': 3000,
        'loadbalancerService': 'gelb.karere.mega.nz',
        'rtc': {
            iceServers:[
/*                {
                    urls: ['turn:trnxxxx.karere.mega.nz:3478?transport=udp'],   // Luxembourg
                    username: "inoo20jdnH",
                    credential: '02nNKDBkkS'
                }
*/
                {
                    urls: 'turn:trn270n001.karere.mega.nz:3478?transport=udp',   // Luxembourg
                    username: "inoo20jdnH",
                    credential: '02nNKDBkkS'
                },
                {
                    urls: 'turn:trn302n001.karere.mega.nz:3478?transport=udp',   // Luxembourg
                    username: "inoo20jdnH",
                    credential: '02nNKDBkkS'
                },
                {
                    urls: 'turn:trn530n001.karere.mega.nz:3478?transport=udp',   // Luxembourg
                    username: "inoo20jdnH",
                    credential: '02nNKDBkkS'
                }
            ]
        },
        filePickerOptions: {
        },
        /**
         * Really simple plugin architecture
         */
        'plugins': {
            'chatStats': ChatStats,
            'chatdIntegration': ChatdIntegration,
            'callManager': CallManager,
            'urlFilter': UrlFilter,
            'emoticonShortcutsFilter': EmoticonShortcutsFilter,
            'emoticonsFilter': EmoticonsFilter,
            'callFeedback': CallFeedback,
            'presencedIntegration': PresencedIntegration,
            'persistedTypeArea': PersistedTypeArea,
            'btRtfFilter': BacktickRtfFilter,
            'rtfFilter': RtfFilter,
            'richpreviewsFilter': RichpreviewsFilter,
            'geoLocationLinks': GeoLocationLinks
        },
        'chatNotificationOptions':  {
            'textMessages': {
                'incoming-chat-message': {
                    'title': "Incoming chat message",
                    'icon': function(notificationObj, params) {
                        return notificationObj.options.icon;
                    },
                    'body': function(notificationObj, params) {
                        return "You have new incoming chat message from: " + params.from;
                    }
                },
                'incoming-attachment': {
                    'title': "Incoming attachment",
                    'icon': function(notificationObj, params) {
                        return notificationObj.options.icon;
                    },
                    'body': function(notificationObj, params) {
                        return params.from + " shared " + (
                                params.attachmentsCount > 1 ? params.attachmentsCount +" files" : "a file"
                            );
                    }
                },
                'incoming-voice-video-call': {
                    'title': l[17878] || "Incoming call",
                    'icon': function(notificationObj, params) {
                        return notificationObj.options.icon;
                    },
                    'body': function(notificationObj, params) {
                        return l[5893].replace('[X]', params.from); // You have an incoming call from [X].
                    }
                },
                'call-terminated': {
                    'title': "Call terminated",
                    'icon': function(notificationObj, params) {
                        return notificationObj.options.icon;
                    },
                    'body': function(notificationObj, params) {
                        return l[5889].replace('[X]', params.from); // Call with [X] ended.
                    }
                }
            },
            'sounds': [
                'alert_info_message',
                'error_message',
                'incoming_chat_message',
                'incoming_contact_request',
                'incoming_file_transfer',
                'incoming_voice_video_call',
                'hang_out',
            ]
        },
        'chatStoreOptions': {
            'autoPurgeMaxMessagesPerRoom': 1024
        }
    };

    this.instanceId = megaChatInstanceId++;

    this.plugins = {};

    self.filePicker = null; // initialized on a later stage when the DOM is fully available.
    self._chatsAwaitingAps = {};

    return this;
};

makeObservable(Chat);

/**
 * Initialize the MegaChat (also will connect to the XMPP)
 */
Chat.prototype.init = function() {
    var self = this;

    // really simple plugin architecture that will initialize all plugins into self.options.plugins[name] = instance
    self.plugins = {};


    self.plugins['chatNotifications'] = new ChatNotifications(self, self.options.chatNotificationOptions);

    self.plugins['chatNotifications'].notifications.rebind('onAfterNotificationCreated.megaChat', function() {
        self.updateSectionUnreadCount();
    });

    Object.keys(self.options.plugins).forEach(plugin => {
        self.plugins[plugin] = new self.options.plugins[plugin](self);
    });

    // UI events
    $(document.body).rebind('mousedown.megachat', '.top-user-status-popup .tick-item', function() {
        var presence = $(this).data("presence");
        self._myPresence = presence;

        $('.top-user-status-popup').removeClass("active").addClass("hidden");

        // presenced integration
        var targetPresence = PresencedIntegration.cssClassToPresence(presence);

        self.plugins.presencedIntegration.setPresence(targetPresence);


        // connection management - chatd shards, presenced
        if (targetPresence !== UserPresence.PRESENCE.OFFLINE) {
            // going from OFFLINE -> online/away/busy, e.g. requires a connection

            Object.keys(self.plugins.chatdIntegration.chatd.shards).forEach(function(k) {
                var v = self.plugins.chatdIntegration.chatd.shards[k];
                v.connectionRetryManager.requiresConnection();
            });
        }
    });

    if (this._pageChangeListener) {
        mBroadcaster.removeListener(this._pageChangeListener)
    }
    var lastOpenedRoom = null;
    this._pageChangeListener = mBroadcaster.addListener('pagechange', function() {
        var room = self.getCurrentRoom();

        if (room && !room.isCurrentlyActive && room.chatId != lastOpenedRoom) {
            // opened window, different then one from the chat ones
            room.hide();
            self.currentlyOpenedChat = null;
        }
        if (lastOpenedRoom && (!room || room.chatId != lastOpenedRoom)) {
            // have opened a chat window before, but now
            // navigated away from it
            if (self.chats[lastOpenedRoom]) {
                self.chats[lastOpenedRoom].hide();
            }
        }
        if (lastOpenedRoom && $('.fm-chat-block').is(".hidden")) {
            // have opened a chat window before, but now
            // navigated away from it
            if (self.chats[lastOpenedRoom]) {
                self.chats[lastOpenedRoom].hide();
                lastOpenedRoom = null;
            }
        }

        if (room) {
            lastOpenedRoom = room.chatId;
        }
        else {
            lastOpenedRoom = null;
        }
        $('.fm-create-chat-button').hide();
    });

    self.$container = $('.fm-chat-block');


    var appContainer = document.querySelector('.section.conversations');

    var initAppUI = function() {
        if (d) {
            console.time('chatReactUiInit');
        }

        self.$conversationsApp = <ConversationsUI.ConversationsApp
            megaChat={self}
        />;

        self.$conversationsAppInstance = ReactDOM.render(
            self.$conversationsApp,
            document.querySelector('.section.conversations')
        );


        if (d) {
            console.timeEnd('chatReactUiInit');
        }
    };


    if (self.is_initialized) {
        self.destroy()
            .always(function() {
                self.init();
            });

        return;
    }
    else {
        if (!appContainer) {
            if (self._appInitPageChangeListener) {
                mBroadcaster.removeListener(self._appInitPageChangeListener);
            }
            self._appInitPageChangeListener = mBroadcaster.addListener('pagechange', function() {
                if (typeof($.leftPaneResizable) === 'undefined' || !fminitialized) {
                    // delay the chat init a bit more! specially for the case of a user getting from /pro -> /fm, which
                    // for some unknown reason, stopped working and delayed the init of $.leftPaneResizable
                    return;
                }
                appContainer = document.querySelector('.section.conversations');
                if (appContainer) {
                    initAppUI();
                    if (self._appInitPageChangeListener) {
                        mBroadcaster.removeListener(self._appInitPageChangeListener);
                    }
                }
            });
        }
        else {
            initAppUI();
        }
    }
    self.is_initialized = true;
    mBroadcaster.sendMessage('chat_initialized');
    if (!anonymouschat) {
        $('.activity-status-block, .activity-status').show();
    }
    else {

    }
    // contacts tab update
    self.on('onRoomInitialized', function(e, room) {
        if (room.type === "private") {
            var userHandle = room.getParticipantsExceptMe()[0];

            if (!userHandle) {
                return;
            }
            var c = M.u[userHandle];

            if (!c) {
                return;
            }

            $('#contact_' + c.u + ' .start-chat-button')
                .addClass("active");
        }

        room.rebind("onChatShown.chatMainList", function() {
            $('.conversations-main-listing').addClass("hidden");
        });

        self.updateDashboard();
    });
    self.on('onRoomDestroy', function(e, room) {
        if (room.type === "private") {
            var userHandle = room.getParticipantsExceptMe()[0];
            var c = M.u[userHandle];

            if (!c) {
                return;
            }

            $('#contact_' + c.u + ' .start-chat-button')
                .removeClass("active");
        }
        if (room.callManagerCall) {
            room.callManagerCall.endCall();
        }
    });

    $(document.body).rebind('mouseover.notsentindicator', '.tooltip-trigger', function() {
        var $this = $(this);
        var $notification = $('.tooltip.' + $this.attr('data-tooltip')).removeClass('hidden');
        var iconTopPos = $this.offset().top;
        var iconLeftPos = $this.offset().left;
        var notificatonHeight = $notification.outerHeight() + 10;
        var notificatonWidth = $notification.outerWidth() / 2 - 10;
        $notification.offset({ top: iconTopPos - notificatonHeight, left: iconLeftPos - notificatonWidth});
    });

    $(document.body).rebind('mouseout.notsentindicator click.notsentindicator', '.tooltip-trigger', function() {
        // hide all tooltips
        var $notification = $('.tooltip');
        $notification.addClass('hidden').removeAttr('style');
    });


    self.registerUploadListeners();

    // those, once changed, should trigger UI reupdate via MegaRenderMixin.
    MegaDataObject.attachToExistingJSObject(
        this,
        {
            "currentlyOpenedChat": null,
            "displayArchivedChats": false,
        },
        true
    );

    self.trigger("onInit");
};

/**
 * Load chat UI Flags from mega.config
 *
 * @param [val] {Object} optional settings, if already received.
 */
Chat.prototype.loadChatUIFlagsFromConfig = function(val) {
    var self = this;
    var flags = val || mega.config.get("cUIF");
    if (flags) {
        if (typeof flags !== 'object') {
            flags = {};
        }

        try {
            Object.keys(CHATUIFLAGS_MAPPING).forEach(function(k) {
                var v = flags[CHATUIFLAGS_MAPPING[k]];
                if (v) {
                    self.chatUIFlags.set(k, v);
                }
            });
        }
        catch (e) {
            console.warn("Failed to parse persisted chatUIFlags: ", e);
        }
    }
};

/**
 * Init chatUIFlags management code
 */
Chat.prototype.initChatUIFlagsManagement = function() {
    var self = this;

    self.loadChatUIFlagsFromConfig();

    this.chatUIFlags.addChangeListener(function(hashmap, extraArg) {
        var flags = mega.config.get("cUIF") || {};
        var hadChanged = false;
        var hadLocalChanged = false;
        // merge w/ raw, so that we won't replace any new (unknown) flags set by new-version clients
        Object.keys(CHATUIFLAGS_MAPPING).forEach(function(k) {
            if (flags[CHATUIFLAGS_MAPPING[k]] !== self.chatUIFlags[k]) {
                if (extraArg === 0xDEAD) {
                    self.chatUIFlags._data[k] = flags[CHATUIFLAGS_MAPPING[k]];
                    hadLocalChanged = true;
                }
                else {
                    flags[CHATUIFLAGS_MAPPING[k]] = self.chatUIFlags[k];
                    hadChanged = true;
                }
            }
        });

        if (hadLocalChanged) {
            if (extraArg !== 0xDEAD) {
                // prevent recursion
                self.chatUIFlags.trackDataChange(0xDEAD);
            }

            $.tresizer();
        }
        if (extraArg === 0xDEAD) {
            // don't update the mega.config, it should be updated already by the ap
            return;
        }
        if (hadChanged) {
            mega.config.set("cUIF", flags);
        }
    });
    mBroadcaster.addListener('fmconfig:cUIF', function(v) {
        self.loadChatUIFlagsFromConfig(v);
        self.chatUIFlags.trackDataChange(0xDEAD);
    });
};

Chat.prototype.unregisterUploadListeners = function(destroy) {
    'use strict';
    var self = this;

    mBroadcaster.removeListener(self._uplDone);
    mBroadcaster.removeListener(self._uplError);
    mBroadcaster.removeListener(self._uplAbort);
    mBroadcaster.removeListener(self._uplFAError);
    mBroadcaster.removeListener(self._uplFAReady);

    if (destroy) {
        mBroadcaster.removeListener(self._uplStart);
    }

    delete self._uplError;
};

Chat.prototype.registerUploadListeners = function() {
    'use strict';
    var self = this;
    var logger = d && MegaLogger.getLogger('chatUploadListener', false, self.logger);

    self.unregisterUploadListeners(true);

    // Iterate chats for which we are uploading
    var forEachChat = function(chats, callback) {
        var result = 0;

        if (!Array.isArray(chats)) {
            chats = [chats];
        }

        for (var i = chats.length; i--;) {
            var room = self.getRoomFromUrlHash(chats[i]);
            if (room) {
                callback(room, ++result);
            }
        }

        return result;
    };

    // find pending upload id by faid or handle
    var lookupPendingUpload = function(id) {
        console.assert((id | 0) > 0 || String(id).length === 8, 'Invalid lookupPendingUpload arguments...');

        for (var uid in ulmanager.ulEventData) {
            if (ulmanager.ulEventData[uid].faid === id || ulmanager.ulEventData[uid].h === id) {
                return uid;
            }
        }
    };

    // Stop listening for upload-related events if there are no more pending uploads
    var unregisterListeners = function() {
        if (!$.len(ulmanager.ulEventData)) {
            self.unregisterUploadListeners();
        }
    };

    // Attach nodes to a chat room on upload completion
    var onUploadComplete = function(ul) {
        if (ulmanager.ulEventData[ul && ul.uid]) {
            forEachChat(ul.chat, function(room) {

                if (d) {
                    logger.debug('Attaching node[%s] to chat room[%s]...', ul.h, room.chatId, ul.uid, ul, M.d[ul.h]);
                }
                room.attachNodes([ul.h]);
            });

            delete ulmanager.ulEventData[ul.uid];
            unregisterListeners();
        }
    };

    // Handle upload completions
    var onUploadCompletion = function(uid, handle, faid, chat) {
        if (!chat) {
            if (d > 1) {
                logger.debug('ignoring upload:completion that is unrelated to chat.', arguments);
            }
            return;
        }

        var n = M.d[handle];
        var ul = ulmanager.ulEventData[uid] || false;

        if (d) {
            logger.debug('upload:completion', uid, handle, faid, ul, n);
        }

        if (!ul || !n) {
            // This should not happen...
            if (d) {
                logger.error('Invalid state error...');
            }
        }
        else {
            ul.h = handle;

            if (ul.efa && (!n.fa || String(n.fa).split('/').length < ul.efa)) {
                // The fa was not yet attached to the node, wait for fa:* events
                ul.faid = faid;

                if (d) {
                    logger.debug('Waiting for file attribute to arrive.', handle, ul);
                }
            }
            else {
                // this is not a media file or the fa is already set, attach node to chat room
                onUploadComplete(ul);
            }
        }
    };

    // Handle upload errors
    var onUploadError = function(uid, error) {
        var ul = ulmanager.ulEventData[uid];

        if (d) {
            logger.debug(error === -0xDEADBEEF ? 'upload:abort' : 'upload.error', uid, error, [ul]);
        }

        if (ul) {
            delete ulmanager.ulEventData[uid];
            unregisterListeners();
        }
    };

    // Signal upload completion on file attribute availability
    var onAttributeReady = function(handle, fa) {
        delay('chat:fa-ready:' + handle, function() {
            var uid = lookupPendingUpload(handle);
            var ul = ulmanager.ulEventData[uid] || false;

            if (d) {
                logger.debug('fa:ready', handle, fa, uid, ul);
            }

            if (ul.h && String(fa).split('/').length >= ul.efa) {
                // The fa is now attached to the node, add it to the chat room(s)
                onUploadComplete(ul);
            }
            else if (d) {
                logger.debug('Not enough file attributes yet, holding...', ul);
            }
        });
    };

    // Signal upload completion if we were unable to store file attributes
    var onAttributeError = function(faid, error, onStorageAPIError, nFAiled) {
        var uid = lookupPendingUpload(faid);
        var ul = ulmanager.ulEventData[uid] || false;

        if (d) {
            logger.debug('fa:error', faid, error, onStorageAPIError, uid, ul, nFAiled, ul.efa);
        }

        // Attaching some fa to the node failed.
        if (ul) {
            // decrement the number of expected file attributes
            ul.efa = Math.max(0, ul.efa - nFAiled) | 0;

            // has this upload finished?
            if (ul.h) {
                // Yes, check whether we must attach the node
                var n = M.d[ul.h] || false;

                if (!ul.efa || (n.fa && String(n.fa).split('/').length >= ul.efa)) {
                    onUploadComplete(ul);
                }
            }
        }
    };

    // Register additional listeners when starting to upload
    var registerLocalListeners = function() {
        self._uplError = mBroadcaster.addListener('upload:error', onUploadError);
        self._uplAbort = mBroadcaster.addListener('upload:abort', onUploadError);
        self._uplFAReady = mBroadcaster.addListener('fa:ready', onAttributeReady);
        self._uplFAError = mBroadcaster.addListener('fa:error', onAttributeError);
        self._uplDone = mBroadcaster.addListener('upload:completion', onUploadCompletion);
    };

    // Listen to upload events
    var onUploadStart = function(data) {
        if (d) {
            logger.info('onUploadStart', [data]);
        }

        var notify = function(room) {
            room.onUploadStart(data);
        };

        for (var k in data) {
            var chats = data[k].chat;

            if (chats && forEachChat(chats, notify) && !self._uplError) {
                registerLocalListeners();
            }
        }
    };

    self._uplStart = mBroadcaster.addListener('upload:start', onUploadStart);
};

Chat.prototype.getRoomFromUrlHash = function(urlHash) {
    // works only for group and private chats for now
    if (urlHash.indexOf("#") === 0) {
        urlHash = urlHash.subtr(1, urlHash.length);
    }
    if (urlHash.indexOf("chat/g/") > -1 || urlHash.indexOf("chat/c/") > -1) {
        var foundRoom = null;
        urlHash = urlHash.replace("chat/g/", "").replace("chat/c/", "");
        megaChat.chats.forEach(function(room) {
            if (!foundRoom && room.chatId === urlHash) {
                foundRoom = room;
            }
        });
        return foundRoom;
    }
    else if (urlHash.indexOf("chat/p/") > -1) {
        var contactHash = urlHash.replace("chat/p/", "");
        if (!contactHash) {
            return;
        }

        var chatRoom = this.getPrivateRoom(contactHash);
        return chatRoom;
    }
    else if (urlHash.indexOf("chat/") > -1 && urlHash[13] === "#") {
        var foundRoom = null;
        var pubHandle = urlHash.replace("chat/", "").split("#")[0];
        urlHash = urlHash.replace("chat/g/", "");
        var chatIds = megaChat.chats.keys();
        for (var i = 0; i < chatIds.length; i++) {
            var cid = chatIds[i];
            var room = megaChat.chats[cid];
            if (room.publicChatHandle === pubHandle) {
                foundRoom = room;
                break;
            }
        }
        return foundRoom;
    }
    else {
        return null;
    }
};


Chat.prototype.updateSectionUnreadCount = SoonFc(function() {
    var self = this;

    if (!self.favico) {
        assert(Favico, 'Favico.js is missing.');


        $('link[rel="icon"]').attr('href',
            (location.hostname === 'mega.nz' ? 'https://mega.nz/' : bootstaticpath) + 'favicon.ico'
        );

        self.favico = new Favico({
            type : 'rectangle',
            animation: 'popFade',
            bgColor : '#fff',
            textColor : '#d00'
        });
    }
    // update the "global" conversation tab unread counter
    var unreadCount = 0;


    var havePendingCall = false;
    var haveCall = false;
    self.haveAnyActiveCall() === false && self.chats.forEach(function(megaRoom, k) {
        if (megaRoom.state == ChatRoom.STATE.LEFT) {
            // skip left rooms.
            return;
        }
        if (megaRoom.isArchived()) {
            return;
        }

        var c = parseInt(megaRoom.messagesBuff.getUnreadCount(), 10);
        unreadCount += c;
        if (!havePendingCall) {
            if (megaRoom.havePendingCall() && megaRoom.uniqueCallParts && !megaRoom.uniqueCallParts[u_handle]) {
                havePendingCall = true;
            }
        }
    });

    unreadCount = unreadCount > 9 ? "9+" : unreadCount;

    var haveContents = false;
    // try NOT to touch the DOM if not needed...
    if (havePendingCall) {
        haveContents = true;
        $('.new-messages-indicator .chat-pending-call')
            .removeClass('hidden');

        if (haveCall) {
            $('.new-messages-indicator .chat-pending-call').addClass('call-exists');
        }
        else {
            $('.new-messages-indicator .chat-pending-call').removeClass('call-exists');
        }
    }
    else {
        $('.new-messages-indicator .chat-pending-call')
            .addClass('hidden')
            .removeClass("call-exists");
    }

    if (self._lastUnreadCount != unreadCount) {
        if (unreadCount && (unreadCount === "9+" || unreadCount > 0)) {
            $('.new-messages-indicator .chat-unread-count')
                .removeClass('hidden')
                .text(unreadCount)
        }
        else {
            $('.new-messages-indicator .chat-unread-count')
                .addClass('hidden');
        }
        self._lastUnreadCount = unreadCount;

        delay('notifFavicoUpd', function () {
            self.favico.reset();
            self.favico.badge(unreadCount);
        });


        self.updateDashboard();
    }
    if (unreadCount && (unreadCount === "9+" || unreadCount > 0)) {
        haveContents = true;
    }

    if (!haveContents) {
        $('.new-messages-indicator').addClass('hidden');
    }
    else {
        $('.new-messages-indicator').removeClass('hidden');
    }

}, 100);

/**
 * Destroy this MegaChat instance (leave all rooms then disconnect)
 *
 * @returns {*}
 */
Chat.prototype.destroy = function(isLogout) {
    var self = this;

    if (self.is_initialized === false) {
        return;
    }

    self.isLoggingOut = isLogout;

    if (self.rtc && self.rtc.logout) {
        self.rtc.logout();
    }

    self.unregisterUploadListeners(true);
    self.trigger('onDestroy', [isLogout]);

    // unmount the UI elements, to reduce any unneeded.
    try {
        if (
            self.$conversationsAppInstance &&
            ReactDOM.findDOMNode(self.$conversationsAppInstance) &&
            ReactDOM.findDOMNode(self.$conversationsAppInstance).parentNode
        ) {
            ReactDOM.unmountComponentAtNode(ReactDOM.findDOMNode(self.$conversationsAppInstance).parentNode);
        }
    }
    catch (e) {
        console.error("Failed do destroy chat dom:", e);
    }



    self.chats.forEach( function(room, roomJid) {
        if (!isLogout) {
            room.destroy(false, true);
        }
        self.chats.remove(roomJid);
    });


    if (
        self.plugins.chatdIntegration &&
        self.plugins.chatdIntegration.chatd &&
        self.plugins.chatdIntegration.chatd.shards
    ) {
        var shards = self.plugins.chatdIntegration.chatd.shards;
        Object.keys(shards).forEach(function(k) {
            shards[k].connectionRetryManager.options.functions.forceDisconnect();
        });
    }

    self.is_initialized = false;

    return MegaPromise.resolve();
};

/**
 * Get ALL contacts from the Mega Contacts list
 *
 * @returns {Array}
 */
Chat.prototype.getContacts = function() {
    var results = [];
    M.u.forEach( function(k, v) {
        if (v.c == 1 || v.c == 2) {
            results.push(v);
        }
    });
    return results;
};

/**
 * Helper to convert XMPP presence from string (e.g. 'chat'), to a CSS class (e.g. will return 'online')
 *
 * @param presence {String}
 * @returns {String}
 */
Chat.prototype.userPresenceToCssClass = function(presence) {
    if (presence === UserPresence.PRESENCE.ONLINE) {
        return 'online';
    }
    else if (presence === UserPresence.PRESENCE.AWAY) {
        return 'away';
    }
    else if (presence === UserPresence.PRESENCE.DND) {
        return 'busy';
    }
    else if (presence === UserPresence.PRESENCE.OFFLINE) {
        return 'offline';
    }
    else {
        return 'black';
    }
};

/**
 * Used to re-render my own presence/status
 */
Chat.prototype.renderMyStatus = function() {
    var self = this;
    if (!self.is_initialized) {
        return;
    }
    if (typeof(megaChat.userPresence) === 'undefined') {
        // still initialising...
        return;
    }

    // reset
    var $status = $('.activity-status-block .activity-status');

    $('.top-user-status-popup .tick-item').removeClass("active");


    $status
        .removeClass('online')
        .removeClass('away')
        .removeClass('busy')
        .removeClass('offline')
        .removeClass('black');



    var actualPresence = self.plugins.presencedIntegration.getMyPresenceSetting();

    var userPresenceConRetMan = megaChat.userPresence.connectionRetryManager;
    var presence = self.plugins.presencedIntegration.getMyPresence();

    var cssClass = PresencedIntegration.presenceToCssClass(
        presence
    );


    if (
        userPresenceConRetMan.getConnectionState() !== ConnectionRetryManager.CONNECTION_STATE.CONNECTED
    ) {
        cssClass = "offline";
    }


    // use the actual presence for ticking the dropdown's items, since the user can be auto away/reconnecting,
    // but his actual presence's settings to be set to online/away/busy/etc
    if (actualPresence === UserPresence.PRESENCE.ONLINE) {
        $('.top-user-status-popup .tick-item[data-presence="chat"]').addClass("active");
    }
    else if (actualPresence === UserPresence.PRESENCE.AWAY) {
        $('.top-user-status-popup .tick-item[data-presence="away"]').addClass("active");
    }
    else if (actualPresence === UserPresence.PRESENCE.DND) {
        $('.top-user-status-popup .tick-item[data-presence="dnd"]').addClass("active");
    }
    else if (actualPresence === UserPresence.PRESENCE.OFFLINE) {
        $('.top-user-status-popup .tick-item[data-presence="unavailable"]').addClass("active");
    }
    else {
        $('.top-user-status-popup .tick-item[data-presence="unavailable"]').addClass("active");
    }

    $status.addClass(
        cssClass
    );

    if (
        userPresenceConRetMan.getConnectionState() === ConnectionRetryManager.CONNECTION_STATE.CONNECTING
    ) {
        $status.parent()
            .addClass("fadeinout");
    }
    else {
        $status.parent()
            .removeClass("fadeinout");
    }

};


/**
 * Reorders the contact tree by last activity (THIS is going to just move DOM nodes, it will NOT recreate them from
 * scratch, the main goal is to be fast and clever.)
 */
Chat.prototype.reorderContactTree = function() {
    var self = this;

    var folders = M.getContacts({
        'h': 'contacts'
    });

    folders = M.sortContacts(folders);

    var $container = $('#treesub_contacts');

    var $prevNode = null;
    $.each(folders, function(k, v) {
        var $currentNode = $('#treeli_' + v.u);

        if (!$prevNode) {
            var $first = $('li:first:not(#treeli_' + v.u + ')', $container);
            if ($first.length > 0) {
                $currentNode.insertBefore($first);
            }
            else {
                $container.append($currentNode);
            }
        }
        else {
            $currentNode.insertAfter($prevNode);
        }


        $prevNode = $currentNode;
    });
};


/**
 * Open (and (optionally) show) a new chat
 *
 * @param userHandles {Array} list of user handles
 * @param type {String} "private" or "group", "public"
 * @param [chatId] {String}
 * @param [chatShard]  {String}
 * @param [chatdUrl]  {String}
 * @param [setAsActive] {Boolean}
 * @returns [roomId {string}, room {MegaChatRoom}, {Deferred}]
 */
Chat.prototype.openChat = function(userHandles, type, chatId, chatShard, chatdUrl, setAsActive, chatHandle,
                                   publicChatKey, ck) {
    var self = this;
    type = type || "private";
    setAsActive = setAsActive === true;

    var roomId = chatId;
    var publicChatKey;

    if (!publicChatKey && chatHandle && self.publicChatKeys[chatHandle]) {
        if (type !== "public") {
            console.error("this should never happen.", type);
            type = "public";
        }
        publicChatKey = self.publicChatKeys[chatHandle];
    }

    var $promise = new MegaPromise();

    if (type === "private") {
        // validate that ALL jids are contacts
        var allValid = true;
        userHandles.forEach(function(user_handle) {
            var contact = M.u[user_handle];
            if (!contact || (contact.c !== 1 && contact.c !== 2 && contact.c !== 0)) {
                // this can happen in case the other contact is not in the contact list anymore, e.g. parked account,
                // removed contact, etc
                allValid = false;
                $promise.reject();
                return false;
            }
        });
        if (allValid === false) {
            $promise.reject();
            return $promise;
        }
        roomId = array.filterNonMatching(userHandles, u_handle)[0];
        if (!roomId) {
            // found a chat where I'm the only user in?
            $promise.reject();
            return $promise;
        }
        if (self.chats[roomId]) {
            $promise.resolve(roomId, self.chats[roomId]);
            return [roomId, self.chats[roomId], $promise];
        }
        else {
            // open new chat
        }
    }
    else {
        assert(roomId, 'Tried to create a group chat, without passing the chatId.');
        roomId = chatId;
    }

    if (type === "group" || type == "public") {
        userHandles.forEach(function(contactHash) {
            assert(contactHash, 'Invalid hash for user (extracted from inc. message)');

            if (!M.u[contactHash]) {
                M.u.set(
                    contactHash,
                    new MegaDataObject(MEGA_USER_STRUCT, true, {
                        'h': contactHash,
                        'u': contactHash,
                        'm': '',
                        'c': undefined
                    })
                );
                M.syncUsersFullname(contactHash);
                self.processNewUser(contactHash, true);
                M.syncContactEmail(contactHash);
            }
        });

        ChatdIntegration._ensureKeysAreLoaded([], userHandles, chatHandle);
        ChatdIntegration._ensureNamesAreLoaded(userHandles, chatHandle);
    }

    if (!roomId && setAsActive) {
        // manual/UI trigger, before the mcf/all chats are already loaded? postpone, since that chat may already
        // exists, so an 'mcc' API call may not be required
        if (
            ChatdIntegration.allChatsHadLoaded.state() === 'pending' ||
            ChatdIntegration.mcfHasFinishedPromise.state() === 'pending'
        ) {
            MegaPromise.allDone([
                ChatdIntegration.allChatsHadLoaded,
                ChatdIntegration.mcfHasFinishedPromise,
            ])
                .always(function() {
                    var res = self.openChat(userHandles, type, chatId, chatShard, chatdUrl, setAsActive,
                        chatHandle, publicChatKey, ck);
                    $promise.linkDoneAndFailTo(
                        res[2]
                    );
                });

            return [roomId, undefined, $promise];
        }
    }

    if (self.chats[roomId]) {
        var room = self.chats[roomId];
        if (setAsActive) {
            room.show();
        }
        $promise.resolve(roomId, room);
        return [roomId, room, $promise];
    }
    if (setAsActive && self.currentlyOpenedChat && self.currentlyOpenedChat != roomId) {
        self.hideChat(self.currentlyOpenedChat);
        self.currentlyOpenedChat = null;
    }

    // chatRoom is still loading from mcf/fmdb
    if (!chatId && ChatdIntegration._loadingChats[roomId]) {
        // wait for it to load
        ChatdIntegration._loadingChats[roomId].loadingPromise
            .done(function() {

                // already initialized ? other mcc action packet triggered init with the latest data for that chat?
                if (self.chats[roomId]) {
                    if ((self.chats[roomId].isArchived())
                        && (roomId === megaChat.currentlyOpenedChat)) {
                        self.chats[roomId].showArchived = true;
                    }
                    $promise.resolve(roomId, self.chats[roomId]);
                    return;
                }
                var res = self.openChat(
                    userHandles,
                    (ap.m === 1) ? "public" : (ap.g === 1 ? "group" : "private"),
                    ap.id,
                    ap.cs,
                    ap.url,
                    setAsActive,
                    chatHandle,
                    publicChatKey,
                    ck
                );

                $promise.linkDoneAndFailTo(
                    res[2]
                );
            })
            .fail(function() {
                $promise.reject(arguments[0]);
            });

        if (setAsActive) {
            // store a flag, that would trigger a "setAsActive" for when the loading finishes
            // e.g. cover the case of the user reloading on a group chat that is readonly now
            ChatdIntegration._loadingChats[roomId].setAsActive = true;
        }

        return [roomId, undefined, $promise];
    }


    // chat room not found, create a new one
    var room = new ChatRoom(
        self,
        roomId,
        type,
        userHandles,
        unixtime(),
        undefined,
        chatId,
        chatShard,
        chatdUrl,
        null,
        chatHandle,
        publicChatKey,
        ck
    );

    self.chats.set(
        room.roomId,
        room
    );

    if (setAsActive && !self.currentlyOpenedChat) {
        room.show();
    }

    // this is retry call, coming when the chat had just finished loading, with a previous call to .openChat with
    // `setAsActive` === true
    if (
        setAsActive === false &&
        chatId &&
        ChatdIntegration._loadingChats[roomId] &&
        ChatdIntegration._loadingChats[roomId].setAsActive
    ) {
        room.show();
    }


    var tmpRoomId = room.roomId;

    if (self.currentlyOpenedChat === tmpRoomId) {
        self.currentlyOpenedChat = room.roomId;
        if (room) {
            room.show();
        }
    }

    if (setAsActive === false) {
        room.showAfterCreation = false;
    }
    else {
        room.showAfterCreation = true;
    }




    this.trigger('onRoomInitialized', [room]);
    room.setState(ChatRoom.STATE.JOINING);
    return [roomId, room, MegaPromise.resolve(roomId, self.chats[roomId])];
};

/**
 * Wrapper around openChat() that does wait for the chat to be ready.
 * @see Chat.openChat
 */
Chat.prototype.smartOpenChat = function() {
    'use strict';
    var self = this;
    var args = toArray.apply(null, arguments);

    if (typeof args[0] === 'string') {
        // Allow to provide a single argument which defaults to opening a private chat with such user
        args[0] = [u_handle, args[0]];
        if (args.length < 2) {
            args.push('private');
        }
    }

    return new MegaPromise(function(resolve, reject) {

        // Helper function to actually wait for a room to be ready once we've got it.
        var waitForReadyState = function(aRoom, aShow) {
            var verify = function() {
                return aRoom.state === ChatRoom.STATE.READY;
            };

            var ready = function() {
                if (aShow) {
                    aRoom.show();
                }
                resolve(aRoom);
            };

            if (verify()) {
                return ready();
            }

            createTimeoutPromise(verify, 300, 3e4).then(ready).catch(reject);
        };

        // Check whether we can prevent the actual call to openChat()
        if (args[0].length === 2 && args[1] === 'private') {
            var chatRoom = self.chats[array.filterNonMatching(args[0], u_handle)[0]];
            if (chatRoom) {
                chatRoom.show();
                return waitForReadyState(chatRoom, args[5]);
            }
        }

        var result = self.openChat.apply(self, args);

        if (result instanceof MegaPromise) {
            // if an straight promise is returned, the operation got rejected
            result.then(reject).catch(reject);
        }
        else if (!Array.isArray(result)) {
            // The function should return an array at all other times...
            reject(EINTERNAL);
        }
        else {
            var room = result[1];
            var roomId = result[0];
            var promise = result[2];

            if (!(promise instanceof MegaPromise)) {
                // Something went really wrong...
                self.logger.error('Unexpected openChat() response...');
                return reject(EINTERNAL);
            }

            self.logger.debug('Waiting for chat "%s" to be ready...', roomId, [room]);

            promise.then(function(aRoomId, aRoom) {
                if (aRoomId !== roomId || (room && room !== aRoom) || !(aRoom instanceof ChatRoom)) {
                    self.logger.error('Unexpected openChat() procedure...', aRoomId, [aRoom]);
                    return reject(EINTERNAL);
                }

                waitForReadyState(aRoom);

            }).catch(reject);
        }
    });
};

/**
 * Utility func to hide all visible chats
 */
Chat.prototype.hideAllChats = function() {
    var self = this;
    self.chats.forEach((chatRoom, k) => {
        if (chatRoom.isCurrentlyActive) {
            chatRoom.hide();
        }
    });
};


/**
 * Returns the currently opened room/chat
 *
 * @returns {null|undefined|Object}
 */
Chat.prototype.getCurrentRoom = function() {
    return this.chats[this.currentlyOpenedChat];
};

/**
 * Returns the currently opened room/chat JID
 *
 * @returns {null|String}
 */
Chat.prototype.getCurrentRoomJid = function() {
    return this.currentlyOpenedChat;
};


/**
 * Hide a room/chat's UI components.
 *
 * @param roomJid
 */
Chat.prototype.hideChat = function(roomJid) {
    var self = this;

    var room = self.chats[roomJid];
    if (room) {
        room.hide();
    }
    else {
        self.logger.warn("Room not found: ", roomJid);
    }
};


/**
 * Send message to a specific room
 *
 * @param roomJid
 * @param val
 */
Chat.prototype.sendMessage = function(roomJid, val) {
    var self = this;

    // queue if room is not ready.
    if (!self.chats[roomJid]) {
        self.logger.warn("Queueing message for room: ", roomJid, val);

        createTimeoutPromise(function() {
            return !!self.chats[roomJid]
        }, 500, self.options.delaySendMessageIfRoomNotAvailableTimeout)
            .done(function() {
                self.chats[roomJid].sendMessage(val);
            });
    }
    else {
        self.chats[roomJid].sendMessage(val);
    }
};


/**
 * Called when a new user is added into MEGA
 *
 * @param u {Object} object containing user information (u.u is required)
 * @param [isNewChat] {boolean} optional - pass true if this is called API that opens OR creates a new chat (new, from
 * in memory perspective)
 */
Chat.prototype.processNewUser = function(u, isNewChat) {
    var self = this;

    self.logger.debug("added: ", u);

    if (self.plugins.presencedIntegration) {
        self.plugins.presencedIntegration.addContact(u, isNewChat);
    }
    self.chats.forEach(function(chatRoom) {
        if (chatRoom.getParticipantsExceptMe().indexOf(u) > -1) {
            chatRoom.trackDataChange();
        }
    });

    self.renderMyStatus();
};

/**
 * Called when a new contact is removed into MEGA
 *
 * @param u {Object} object containing user information (u.u is required)
 */
Chat.prototype.processRemovedUser = function(u) {
    var self = this;

    self.logger.debug("removed: ", u);

    if (self.plugins.presencedIntegration) {
        self.plugins.presencedIntegration.removeContact(u);
    }
    self.chats.forEach(function(chatRoom) {
        if (chatRoom.getParticipantsExceptMe().indexOf(u) > -1) {
            chatRoom.trackDataChange();
        }
    });

    self.renderMyStatus();
};


/**
 * Refresh the currently active conversation list in the UI
 */
Chat.prototype.refreshConversations = function() {
    var self = this;


    //$('.fm-tree-panel > .jspContainer > .jspPane > .nw-tree-panel-header').hide();
    //$('.fm-tree-panel > .nw-tree-panel-header').hide();


    if (!self.$container && !megaChatIsReady && u_type == 0) {
        $('.fm-chat-block').hide();
        return false;
    }
    $('.section.conversations .fm-chat-is-loading').addClass('hidden');
    // move to the proper place if loaded before the FM
    if (self.$container.parent('.section.conversations .fm-right-files-block').length == 0) {
        $('.section.conversations .fm-right-files-block').append(self.$container);
    }
    self.$leftPane = self.$leftPane || $('.conversationsApp .fm-left-panel');
    if (anonymouschat) {
        self.$leftPane.addClass('hidden');
    }
    else {
        self.$leftPane.removeClass('hidden');
    }
};

Chat.prototype.closeChatPopups = function() {
    var activePopup = $('.chat-popup.active');
    var activeButton = $('.chat-button.active');
    activeButton.removeClass('active');
    activePopup.removeClass('active');

    if (activePopup.attr('class')) {
        activeButton.removeClass('active');
        activePopup.removeClass('active');
        if (
            activePopup.attr('class').indexOf('fm-add-contact-popup') === -1 &&
            activePopup.attr('class').indexOf('fm-start-call-popup') === -1
        ) {
            activePopup.css('left', '-' + 10000 + 'px');
        }
        else activePopup.css('right', '-' + 10000 + 'px');
    }
};


/**
 * Debug helper
 */

Chat.prototype.getChatNum = function(idx) {
    return this.chats[this.chats.keys()[idx]];
};

/**
 * Called when Conversations tab is opened
 *
 * @returns boolean true if room was automatically shown and false if the listing page is shown
 */
Chat.prototype.renderListing = function() {
    var self = this;

    self.hideAllChats();

    M.hideEmptyGrids();

    //$('.fm-tree-panel > .jspContainer > .jspPane > .nw-tree-panel-header').hide();
    //$('.fm-tree-panel > .nw-tree-panel-header').hide();

    $('.files-grid-view').addClass('hidden');
    $('.fm-blocks-view').addClass('hidden');
    $('.contacts-grid-view').addClass('hidden');
    $('.fm-chat-block').addClass('hidden');
    $('.fm-contacts-blocks-view').addClass('hidden');

    $('.fm-right-files-block').removeClass('hidden');
    $('.nw-conversations-item').removeClass('selected');


    M.onSectionUIOpen('conversations');

    if (Object.keys(self.chats).length === 0 || Object.keys(ChatdIntegration._loadingChats).length !== 0) {
        $('.fm-empty-conversations').removeClass('hidden');
    }
    else {
        $('.fm-empty-conversations').addClass('hidden');

        if (
            self.lastOpenedChat &&
            self.chats[self.lastOpenedChat] &&
            self.chats[self.lastOpenedChat]._leaving !== true &&
            self.chats[self.lastOpenedChat].isDisplayable()
        ) {
            // have last opened chat, which is active
            self.chats[self.lastOpenedChat].setActive();
            self.chats[self.lastOpenedChat].show();
            return self.chats[self.lastOpenedChat];
        }
        else {
            if (self.chats.length > 0) {
                if (!self.displayArchivedChats) {
                    return self.showLastActive();
                }
                else {
                    return false;
                }

            }
            else {
                $('.fm-empty-conversations').removeClass('hidden');
            }
        }
    }
};

/**
 * Inject the list of attachments for the current room into M.v
 * @param {String} roomId The room identifier
 */
Chat.prototype.setAttachments = function(roomId) {
    'use strict';

    if (M.chat) {
        if (d) {
            console.assert(this.chats[roomId] && this.chats[roomId].isCurrentlyActive, 'check this...');
        }

        // Reset list of attachments
        M.v = Object.values(M.chc[roomId] || {});

        if (M.v.length) {
            M.v.sort(M.sortObjFn('co'));

            for (var i = M.v.length; i--;) {
                var n = M.v[i];

                if (!n.revoked && !n.seen) {
                    n.seen = -1;

                    if (String(n.fa).indexOf(':1*') > 0) {
                        this._enqueueImageLoad(n);
                    }
                }
            }
        }
    }
    else if (d) {
        console.warn('Not in chat...');
    }
};

/**
 * Enqueue image loading.
 * @param {MegaNode} n The attachment node
 * @private
 */
Chat.prototype._enqueueImageLoad = function(n) {
    'use strict';

    // check whether the node is cached from the cloud side

    var cc = previews[n.h] || previews[n.hash];
    if (cc) {
        if (cc.poster) {
            n.src = cc.poster;
        }
        else {
            if (cc.full && n.mime !== 'image/png' && n.mime !== 'image/webp') {
                cc = cc.prev || false;
            }

            if (String(cc.type).startsWith('image/')) {
                n.src = cc.src;
            }
        }
    }

    var cached = n.src;

    // check the node does have a file attribute, this should be implicit
    // invoking this function but we may want to load originals later.

    if (String(n.fa).indexOf(':1*') > 0) {
        var load = false;
        var dedup = true;

        // Only load the image if its attribute was not seen before
        // TODO: also dedup from matching 'n.hash' checksum (?)

        if (this._imageAttributeCache[n.fa]) {
            this._imageAttributeCache[n.fa].push(n.ch);
        }
        else {
            this._imageAttributeCache[n.fa] = [n.ch];
            load = !cached;
        }

        // Only load the image once if its node is posted around several rooms

        if (this._imageLoadCache[n.h]) {
            this._imageLoadCache[n.h].push(n.ch);
        }
        else {
            this._imageLoadCache[n.h] = [n.ch];

            if (load) {
                this._imagesToBeLoaded[n.h] = n;
                dedup = false;
            }
        }

        if (dedup) {
            cached = true;
        }
        else {
            delay('chat:enqueue-image-load', this._doLoadImages.bind(this), 350);
        }
    }

    if (cached) {
        this._doneLoadingImage(n.h);
    }
};

/**
 * Actual code that is throttled and does load a bunch of queued images
 * @private
 */
Chat.prototype._doLoadImages = function() {
    "use strict";

    var self = this;
    var imagesToBeLoaded = self._imagesToBeLoaded;
    self._imagesToBeLoaded = Object.create(null);

    var chatImageParser = function(h, data) {
        var n = M.chd[(self._imageLoadCache[h] || [])[0]] || false;

        if (data !== 0xDEAD) {
            // Set the attachment node image source
            n.src = mObjectURL([data.buffer || data], 'image/jpeg');
            n.srcBuffer = data;
        }
        else if (d) {
            console.warn('Failed to load image for %s', h, n);
        }

        self._doneLoadingImage(h);
    };

    var onSuccess = function(ctx, origNodeHandle, data) {
        chatImageParser(origNodeHandle, data);
    };

    var onError = function(origNodeHandle) {
        chatImageParser(origNodeHandle, 0xDEAD);
    };

    api_getfileattr(imagesToBeLoaded, 1, onSuccess, onError);

    [imagesToBeLoaded].forEach(function(obj) {
        Object.keys(obj).forEach(function(handle) {
            self._startedLoadingImage(handle);
        });
    });
};

/**
 * Retrieve all image loading (deduped) nodes for a handle
 * @param {String} h The node handle
 * @param {Object} [src] Empty object to store the source node that triggered the load.
 * @private
 */
Chat.prototype._getImageNodes = function(h, src) {
    var nodes = this._imageLoadCache[h] || [];
    var handles = [].concat(nodes);

    for (var i = nodes.length; i--;) {
        var n = M.chd[nodes[i]] || false;

        if (this._imageAttributeCache[n.fa]) {
            handles = handles.concat(this._imageAttributeCache[n.fa]);
        }
    }
    handles = array.unique(handles);

    nodes = handles.map(function(ch) {
        var n = M.chd[ch] || false;
        if (src && n.src) {
            Object.assign(src, n);
        }
        return n;
    });

    return nodes;
};

/**
 * Called when an image starts loading from the preview servers
 * @param {String} h The node handle being loaded.
 * @private
 */
Chat.prototype._startedLoadingImage = function(h) {
    "use strict";

    var nodes = this._getImageNodes(h);

    for (var i = nodes.length; i--;) {
        var n = nodes[i];

        if (!n.src && n.seen !== 2) {
            // to be used in the UI with the next design changes.
            var imgNode = document.getElementById(n.ch);

            if (imgNode && (imgNode = imgNode.querySelector('img'))) {
                imgNode.parentNode.parentNode.classList.add('thumb-loading');
            }
        }
    }
};

/**
 * Internal - called when an image is loaded in previews
 * @param {String} h The node handle being loaded.
 * @private
 */
Chat.prototype._doneLoadingImage = function(h) {
    "use strict";

    var setSource = function(n, img, src) {
        var message = n.mo;

        img.onload = function() {
            img.onload = null;
            n.srcWidth = this.naturalWidth;
            n.srcHeight = this.naturalHeight;

            // Notify changes...
            if (message) {
                message.trackDataChange();
            }
        };
        img.setAttribute('src', src);
    };

    var root = {};
    var nodes = this._getImageNodes(h, root);
    var src = root.src;

    for (var i = nodes.length; i--;) {
        var n = nodes[i];
        var imgNode = document.getElementById(n.ch);

        if (imgNode && (imgNode = imgNode.querySelector('img'))) {
            var parent = imgNode.parentNode;
            var container = parent.parentNode;

            if (src) {
                container.classList.add('thumb');
                parent.classList.remove('no-thumb');
            }
            else {
                container.classList.add('thumb-failed');
            }

            n.seen = 2;
            container.classList.remove('thumb-loading');
            setSource(n, imgNode, src || window.noThumbURI || '');
        }

        // Set the same image data/uri across all affected (same) nodes
        if (src) {
            n.src = src;

            if (root.srcBuffer && root.srcBuffer.byteLength) {
                n.srcBuffer = root.srcBuffer;
            }

            // Cache the loaded image in the cloud side for reuse
            if (n.srcBuffer && !previews[n.h] && is_image3(n)) {
                preqs[n.h] = 1;
                previewimg(n.h, n.srcBuffer, 'image/jpeg');
                previews[n.h].fromChat = Date.now();
            }
        }

        // Remove the reference to the message since it's no longer needed.
        delete n.mo;
    }
};

/**
 * Show the last active chat room
 * @returns {*}
 */
Chat.prototype.showLastActive = function() {
    var self = this;

    if (self.chats.length > 0 && self.allChatsHadInitialLoadedHistory()) {
        var sortedConversations = obj_values(self.chats.toJS());

        sortedConversations.sort(M.sortObjFn("lastActivity", -1));
        var index = 0;
        // find next active chat , it means a chat which is active or archived chat opened in the active chat list.
        while ((index < sortedConversations.length) &&
               (!sortedConversations[index].isDisplayable())) {
                index++;
        }
        if (index < sortedConversations.length) {
            var room = sortedConversations[index];
            if (!room.isActive()) {
                room.setActive();
                room.show();
            }
            return room;
        }
        else {
            return false;
        }
    }
    else {
        return false;
    }
};


Chat.prototype.allChatsHadLoadedHistory = function() {
    var self = this;

    var chatIds = self.chats.keys();

    for (var i = 0; i < chatIds.length; i++) {
        var room = self.chats[chatIds[i]];
        if (room.isLoading()) {
            return false;
        }
    }

    return true;
};

Chat.prototype.allChatsHadInitialLoadedHistory = function() {
    var self = this;

    var chatIds = self.chats.keys();

    for (var i = 0; i < chatIds.length; i++) {
        var room = self.chats[chatIds[i]];
        if (room.initialMessageHistLoaded.state() === 'pending') {
            return false;
        }
    }

    return true;
};

/**
 * Tries to find if there is a opened (private) chat room with user `h`
 *
 * @param h {string} hash of the user
 * @returns {false|ChatRoom}
 */
Chat.prototype.getPrivateRoom = function(h) {
    'use strict';

    return this.chats[h] || false;
};


Chat.prototype.createAndShowPrivateRoomFor = function(h) {
    'use strict';
    var room = this.getPrivateRoom(h);

    if (room) {
        chatui(h);
        return MegaPromise.resolve(room);
    }

    var promise = megaChat.smartOpenChat(h);

    promise.done(function(room) {
        room.setActive();
    });

    return promise;
};

Chat.prototype.createAndShowGroupRoomFor = function(contactHashes, topic, keyRotation, createChatLink) {
    this.trigger(
        'onNewGroupChatRequest',
        [
            contactHashes,
            {
                'topic': topic || "",
                'keyRotation': keyRotation,
                'createChatLink': createChatLink
            }
        ]
    );
};

/**
 * Debug/dev/testing function
 *
 * @private
 */
Chat.prototype._destroyAllChatsFromChatd = function() {
    var self = this;

    asyncApiReq({'a': 'mcf', 'v': Chatd.VERSION}).done(function(r) {
        r.c.forEach(function(chatRoomMeta) {
            if (chatRoomMeta.g === 1) {
                chatRoomMeta.u.forEach(function (u) {
                    if (u.u !== u_handle) {
                        api_req({
                            a: 'mcr',
                            id: chatRoomMeta.id,
                            u: u.u,
                            v: Chatd.VERSION
                        });
                    }
                });
                api_req({
                    a: 'mcr',
                    id: chatRoomMeta.id,
                    u: u_handle,
                    v: Chatd.VERSION
                });
            }
        })
    });
};

Chat.prototype._leaveAllGroupChats = function() {
    asyncApiReq({'a': 'mcf', 'v': Chatd.VERSION}).done(function(r) {
        r.c.forEach(function(chatRoomMeta) {
            if (chatRoomMeta.g === 1) {
                asyncApiReq({
                    "a":"mcr", // request identifier
                    "id": chatRoomMeta.id, // chat id
                    "v": Chatd.VERSION
                });
            }
        })
    });
};

Chat.prototype.updateDashboard = function() {
    if (M.currentdirid === 'dashboard') {
        delay('dashboard:updchat', dashboardUI.updateChatWidget);
    }
};


/**
 * Warning: The data returned by this function is loaded directly and not hash-checked like in the secureboot.js. So
 * please use carefully and escape EVERYTHING that is loaded thru this.
 *
 * @param name
 * @returns {MegaPromise}
 */
Chat.prototype.getEmojiDataSet = function(name) {
    var self = this;
    assert(name === "categories" || name === "emojis", "Invalid emoji dataset name passed.");

    if (!self._emojiDataLoading) {
        self._emojiDataLoading = {};
    }
    if (!self._emojiData) {
        self._emojiData = {};
    }

    if (self._emojiData[name]) {
        return MegaPromise.resolve(
            self._emojiData[name]
        );
    }
    else if (self._emojiDataLoading[name]) {
        return self._emojiDataLoading[name];
    }
    else if (name === "categories") {
        // reduce the XHRs by one, by simply moving the categories_v2.json to be embedded inline here:
        self._emojiData[name] = ["symbols","activity","objects","nature","food","people","travel","flags"];
        // note, when updating categories_vX.json, please update this ^^ manually.

        return MegaPromise.resolve(self._emojiData[name]);
    }
    else {
        var promise = new MegaPromise();
        self._emojiDataLoading[name] = promise;

        M.xhr({
            type: 'json',
            url: staticpath + "js/chat/emojidata/" + name + "_v" + EMOJI_DATASET_VERSION + ".json"
        }).then(function(ev, data) {
            self._emojiData[name] = data;
            delete self._emojiDataLoading[name];
            promise.resolve(data);
        }).catch(function(ev, error) {
            if (d) {
                self.logger.warn('Failed to load emoji data "%s": %s', name, error, [ev]);
            }
            delete self._emojiDataLoading[name];
            promise.reject(error);
        });

        return promise;
    }
};

/**
 * Method for checking if an emoji by that slug exists
 * @param slug
 */
Chat.prototype.isValidEmojiSlug = function(slug) {
    var self = this;
    var emojiData = self._emojiData['emojis'];
    if (!emojiData) {
        self.getEmojiDataSet('emojis');
        return false;
    }

    for (var i = 0; i < emojiData.length; i++) {
        if (emojiData[i]['n'] === slug) {
            return true;
        }
    }
};

/**
 * A simple alias that returns PresencedIntegration's presence for the current user
 *
 * @returns {Number|undefined} UserPresence.PRESENCE.* or undefined for offline/unknown presence
 */
Chat.prototype.getMyPresence = function() {
    if (u_handle && this.plugins.presencedIntegration) {
        return this.plugins.presencedIntegration.getMyPresence();
    }
    else {
        return;
    }
};

/**
 * A simple alias that returns PresencedIntegration's presence for the a specific user
 *
 * @param {String} user_handle the target user's presence
 * @returns {Number|undefined} UserPresence.PRESENCE.* or undefined for offline/unknown presence
 */
Chat.prototype.getPresence = function(user_handle) {
    if (user_handle && this.plugins.presencedIntegration) {
        return this.plugins.presencedIntegration.getPresence(user_handle);
    }
    else {
        return;
    }
};

Chat.prototype.getPresenceAsCssClass = function(user_handle) {
    var presence = this.getPresence(user_handle);
    return this.presenceStringToCssClass(presence);
};

/**
 * Utility for converting UserPresence.PRESENCE.* to css class strings
 *
 * @param {Number|undefined} presence
 * @returns {String}
 */
Chat.prototype.presenceStringToCssClass = function (presence) {
    if (presence === UserPresence.PRESENCE.ONLINE) {
        return 'online';
    }
    else if (presence === UserPresence.PRESENCE.AWAY) {
        return 'away';
    }
    else if (presence === UserPresence.PRESENCE.DND) {
        return 'busy';
    }
    else if (!presence || presence === UserPresence.PRESENCE.OFFLINE) {
        return 'offline';
    }
    else {
        return 'black';
    }
};


/**
 * Internal method for generating unique (and a bit randomised) message ids
 *
 * @param {string} roomId
 * @param {string} messageAndMeta
 * @returns {string}
 */
Chat.prototype.generateTempMessageId = function(roomId, messageAndMeta) {
    var messageIdHash = u_handle + roomId;
    if (messageAndMeta) {
        messageIdHash += messageAndMeta;
    }
    return "m" + fastHashFunction(messageIdHash) + "_" + unixtime();
};


Chat.prototype.getChatById = function(chatdId) {
    var self = this;
    if (self.chats[chatdId]) {
        return self.chats[chatdId];
    }
    else if (self.chatIdToRoomId && self.chatIdToRoomId[chatdId] && self.chats[self.chatIdToRoomId[chatdId]]) {
        return self.chats[self.chatIdToRoomId[chatdId]];
    }

    var found = false;
    self.chats.forEach(function(chatRoom) {
        if (!found && chatRoom.chatId === chatdId) {
            found = chatRoom;
            return false;
        }
    });
    return found ? found : false;
};


/**
 * Returns true if a 'rtc call' is found in .rtc.calls that (optionally) matches chatIdBin
 * @param [chatIdBin] {String}
 * @returns {boolean}
 */
Chat.prototype.haveAnyIncomingOrOutgoingCall = function(chatIdBin) {
    if (chatIdBin) {
        if (!this.rtc || !this.rtc.calls || Object.keys(this.rtc.calls).length === 0) {
            return false;
        }
        else if (this.rtc && this.rtc.calls) {
            var callIds = Object.keys(this.rtc.calls);
            for (var i = 0; i < callIds.length; i++) {
                if (this.rtc.calls[callIds[i]].chatid !== chatIdBin) {
                    return true;
                }
            }
            // didn't found any chat that doesn't match the current chatdIdBin
            return false;
        }
        else {
            return false
        }
    }
    else {
        return this.rtc && this.rtc.calls && Object.keys(this.rtc.calls).length > 0;
    }
};

/**
 * Returns true if there is a chat room with an active (started/starting) call.
 *
 * @returns {boolean}
 */
Chat.prototype.haveAnyActiveCall = function() {
   var self = this;
   var chatIds = self.chats.keys();
   for (var i = 0; i < chatIds.length; i++) {
       if (self.chats[chatIds[i]].haveActiveCall()) {
           return true;
       }
   }
   return false;
};


/**
 * Creates a 1on1 chat room and opens the send files from cloud drive dialog automatically
 *
 * @param {string} user_handle
 */
Chat.prototype.openChatAndSendFilesDialog = function(user_handle) {
    'use strict';

    this.smartOpenChat(user_handle)
        .then(function(room) {
            room.setActive();
            $(room).trigger('openSendFilesDialog');
        })
        .catch(this.logger.error.bind(this.logger));
};

/**
 * Wrapper around Chat.openChat and ChatRoom.attachNodes as a single helper function
 * @param {Array|String} targets Where to send the nodes
 * @param {Array} nodes The list of nodes to attach into the room(s)
 * @returns {MegaPromise}
 * @see Chat.openChat
 * @see ChatRoom.attachNodes
 */
Chat.prototype.openChatAndAttachNodes = function(targets, nodes) {
    'use strict';
    var self = this;

    if (d) {
        console.group('Attaching nodes to chat room(s)...', targets, nodes);
    }

    return new MegaPromise(function(resolve, reject) {
        var promises = [];
        var attachNodes = function(roomId) {
            return new MegaPromise(function(resolve, reject) {
                self.smartOpenChat(roomId)
                    .then(function(room) {
                        room.attachNodes(nodes).then(resolve.bind(self, room)).catch(reject);
                    })
                    .catch(function(ex) {
                        if (d) {
                            self.logger.warn('Cannot openChat for %s and hence nor attach nodes to it.', roomId, ex);
                        }
                        reject(ex);
                    });
            });
        };

        if (!Array.isArray(targets)) {
            targets = [targets];
        }

        for (var i = targets.length; i--;) {
            promises.push(attachNodes(targets[i]));
        }

        MegaPromise.allDone(promises).unpack(function(result) {
            var room;

            for (var i = result.length; i--;) {
                if (result[i] instanceof ChatRoom) {
                    room = result[i];
                    break;
                }
            }

            if (room) {
                showToast('send-chat', nodes.length > 1 ? l[17767] : l[17766]);
                var roomUrl = room.getRoomUrl().replace("fm/", "");
                M.openFolder(roomUrl).always(resolve);
            }
            else {
                if (d) {
                    self.logger.warn('openChatAndAttachNodes failed in whole...', result);
                }
                reject(result);
            }

            if (d) {
                console.groupEnd();
            }
        });
    });
};

Chat.prototype.toggleUIFlag = function(name) {
    this.chatUIFlags.set(name, this.chatUIFlags[name] ? 0 : 1);
};

Chat.prototype.onSnActionPacketReceived = function() {
    if (this._queuedMccPackets.length > 0) {
        var aps = this._queuedMccPackets;
        this._queuedMccPackets = [];
        for (var i = 0; i < aps.length; i++) {
            mBroadcaster.sendMessage('onChatdChatUpdatedActionPacket', aps[i]);
        }
    }
};


Chat.prototype.getFrequentContacts = function() {
    var chats = this.chats;
    var recentContacts = {};
    var promises = [];
    var finishedLoadingChats = {};
    var loadingMoreChats = {};

    // this should use potential "Incoming shares" managed .ts, but it seems it doesn't work and its only updated
    // by the chat, but in a different algorithm (that won't be UX-effective enough for showing top3-5 "recent"
    // contacts, so its disabled for now.
    // PS: .ts is used for "Last interaction", which is different (semantically) then "Recent(s)"

    // M.u.forEach(function(contact) {
    //     if (contact.c === 1 && contact.ts) {
    //         recentContacts[contact.h] = {'userId': contact.h, 'ts': contact.ts};
    //     }
    // });

    var _calculateLastTsFor = function(r, maxMessages) {
        var msgIds = r.messagesBuff.messages.keys().reverse();
        msgIds = msgIds.splice(0, maxMessages);
        msgIds.forEach(function(msgId) {
            var msg = r.messagesBuff.getMessageById(msgId);
            var contactHandle = msg.userId === "gTxFhlOd_LQ" && msg.meta ? msg.meta.userId : msg.userId;
            if (r.type === "private" && contactHandle === u_handle) {
                contactHandle = contactHandle || r.getParticipantsExceptMe()[0]
            }

            if (
                contactHandle !== "gTxFhlOd_LQ" &&
                M.u[contactHandle] && M.u[contactHandle].c === 1 &&
                contactHandle !== u_handle
            ) {
                if (!recentContacts[contactHandle] || recentContacts[contactHandle].ts < msg.delay) {
                    recentContacts[contactHandle] = {'userId': contactHandle, 'ts': msg.delay};
                }
            }
        });
    };

    chats.forEach(function(r) {
        /**
         * @type ChatRoom
         */
            // r = r;

        var _histDecryptedCb = function(r) {
                // console.error("loading?", r.chatId, r.messagesBuff.messages.length);
                if (!loadingMoreChats[r.chatId] &&
                    r.messagesBuff.messages.length < 32 &&
                    r.messagesBuff.haveMoreHistory()
                ) {
                    // console.error("loading:", r.chatId);
                    loadingMoreChats[r.chatId] = true;
                    r.messagesBuff.retrieveChatHistory(false);
                }
                else {
                    $(r).unbind('onHistoryDecrypted.recent');
                    _calculateLastTsFor(r, 32);
                    delete loadingMoreChats[r.chatId];
                    finishedLoadingChats[r.chatId] = true;
                }


            };


        if (r.isLoading()) {
            var promise = createTimeoutPromise(function() {
                return finishedLoadingChats[r.chatId] === true;
            },
                500,
                10000,
                undefined,
                undefined,
                r.roomId + "FrequentsLoading"
            );

            finishedLoadingChats[r.chatId] = false;
            promises.push(promise);
            $(r).rebind('onHistoryDecrypted.recent', _histDecryptedCb.bind(this, r));
        }
        else if (r.messagesBuff.messages.length < 32 && r.messagesBuff.haveMoreHistory()) {
            // console.error("loading:", r.chatId);
            loadingMoreChats[r.chatId] = true;
            finishedLoadingChats[r.chatId] = false;
            $(r).rebind('onHistoryDecrypted.recent', _histDecryptedCb.bind(this, r));
            var promise = createTimeoutPromise(function() {
                return finishedLoadingChats[r.chatId] === true;
            }, 500, 15000);
            promises.push(promise);
            r.messagesBuff.retrieveChatHistory(false);
        }
        else {
            _calculateLastTsFor(r, 32);
        };
        // console.error(r.getRoomTitle(), r.messagesBuff.messages.length);
    });

    var masterPromise = new MegaPromise();
    MegaPromise.allDone(promises).always(function () {
        var result = obj_values(recentContacts).sort(function(a, b) {
            return a.ts < b.ts ? 1 : (b.ts < a.ts ? -1 : 0);
        });
        masterPromise.resolve(result.reverse());
    });
    return masterPromise;
};


Chat.prototype.eventuallyAddDldTicketToReq = function(req) {
    if (!u_handle) {
        return;
    }

    var currentRoom = this.getCurrentRoom();
    if (currentRoom && currentRoom.type == "public" && currentRoom.publicChatHandle && (
        anonymouschat || (
            currentRoom.membersSetFromApi &&
            !currentRoom.membersSetFromApi.members[u_handle]
        )
    )
    ) {
        req['cauth'] = currentRoom.publicChatHandle;
    }
};

Chat.prototype.safeForceUpdate = function() {
    if (this.$conversationsAppInstance) {
        var $cai = this.$conversationsAppInstance;
        try {
            $cai.forceUpdate();
        } catch (e) {
            console.error("safeForceUpdate: ", $cai, e);
        }
    }
};

Chat.prototype.loginOrRegisterBeforeJoining = function(chatHandle, forceRegister, forceLogin, notJoinReq) {
    if (!chatHandle && (page === 'chat' || page.indexOf('chat') > -1)) {
        chatHandle = getSitePath().split("chat/")[1].split("#")[0];
    }
    assert(chatHandle, 'missing chat handle when calling megaChat.loginOrRegisterBeforeJoining');

    var chatKey = "#" + window.location.hash.split("#").pop();
    var doShowLoginDialog = function() {
        mega.ui.showLoginRequiredDialog({
                minUserType: 3,
                skipInitialDialog: 1
            })
            .done(function () {
                if (page !== 'login') {
                    if (!notJoinReq) {
                        localStorage.autoJoinOnLoginChat = JSON.stringify(
                            [chatHandle, unixtime(), chatKey]
                        );
                    }
                    window.location.reload();
                }
            });
    };

    var doShowRegisterDialog = function() {
        mega.ui.showRegisterDialog({
            title: l[5840],
            onCreatingAccount: function() {},
            onLoginAttemptFailed: function(registerData) {
                msgDialog('warninga:' + l[171], l[1578], l[218], null, function(e) {
                    if (e) {
                        $('.pro-register-dialog').addClass('hidden');
                        if (signupPromptDialog) {
                            signupPromptDialog.hide();
                        }
                        doShowLoginDialog();
                    }
                });
            },

            onAccountCreated: function(gotLoggedIn, registerData) {
                if (!notJoinReq) {
                    localStorage.awaitingConfirmationAccount = JSON.stringify(registerData);
                    localStorage.autoJoinOnLoginChat = JSON.stringify(
                        [chatHandle, unixtime(), chatKey]
                    );
                }
                // If true this means they do not need to confirm their email before continuing to step 2
                mega.ui.sendSignupLinkDialog(registerData, false);
                megaChat.destroy();
            }
        });
    };


    if (u_handle && u_handle !== "AAAAAAAAAAA") {
        // logged in/confirmed account in another tab!
        if (!notJoinReq) {
            localStorage.autoJoinOnLoginChat = JSON.stringify(
                [chatHandle, unixtime(), chatKey]
            );
        }
        window.location.reload();
        return;
    }
    if (forceRegister) {
        return doShowRegisterDialog();
    }
    else if (forceLogin) {
        return doShowLoginDialog();
    }

    // no forcing, proceed w/ regular logic.
    if (u_wasloggedin()) {
        doShowLoginDialog();
    }
    else {
        doShowRegisterDialog();
    }
};

window.Chat = Chat;
window.chatui = chatui;

if (module.hot) {
    module.hot.accept();
}

export default {Chat, chatui};
