import { SpriteBase } from "./SpriteBase";
import { TileEvent, event_types as tile_event_types } from "./tile_events/TileEvent";
import * as numbers from './magic_numbers';
import { directions, get_surroundings, mount_collision_polygon } from "./utils";
import { JumpEvent } from "./tile_events/JumpEvent";
import { ClimbEvent } from "./tile_events/ClimbEvent";
import { GoldenSun } from "./GoldenSun";

export const interactable_object_interaction_types = {
    ONCE: "once",
    INFINITE: "infinite"
};

export const interactable_object_event_types = {
    JUMP: "jump",
    JUMP_AROUND: "jump_around",
    CLIMB: "climb"
};

export class InteractableObjects_Sprite extends SpriteBase {
    constructor (key_name, actions) {
        super(key_name, actions);
    }
}

export class InteractableObjects {
    public game: Phaser.Game;
    public data: GoldenSun;
    public key_name: string;
    public x: number;
    public y: number;
    public sprite_info: SpriteBase;
    public allowed_tiles: {x: number, y: number, collision_layer: number}[];
    public base_collision_layer: number;
    public collider_layer_shift: number;
    public intermediate_collider_layer_shift: number;
    public not_allowed_tiles: {x: number, y: number}[];
    public object_drop_tiles: any;
    public events: Set<TileEvent>;
    public events_info: any;
    public current_x: number;
    public current_y: number;
    public custom_data: any;
    public collision_change_functions: Function[];
    public color_filter: any;
    public sprite: Phaser.Sprite;

    constructor(game, data, key_name, x, y, allowed_tiles, base_collision_layer, collider_layer_shift, not_allowed_tiles, object_drop_tiles, intermediate_collider_layer_shift) {
        this.game = game;
        this.data = data;
        this.key_name = key_name;
        this.x = x;
        this.y = y;
        this.sprite_info = null;
        this.allowed_tiles = allowed_tiles;
        this.base_collision_layer = base_collision_layer;
        this.collider_layer_shift = collider_layer_shift;
        this.intermediate_collider_layer_shift = intermediate_collider_layer_shift === undefined ? 0 : intermediate_collider_layer_shift;
        this.not_allowed_tiles = not_allowed_tiles === undefined ? [] : not_allowed_tiles;
        this.object_drop_tiles = object_drop_tiles === undefined ? [] : object_drop_tiles;
        this.events = new Set();
        this.events_info = {};
        this.current_x = x;
        this.current_y = y;
        this.custom_data = {
            collision_tiles_bodies: []
        };
        this.collision_change_functions = [];
        this.color_filter = this.game.add.filter('ColorFilters');
    }

    set_sprite(sprite) {
        this.sprite = sprite;
    }

    position_allowed(x, y) {
        if (this.data.map.interactable_objects.filter(item => {
            return item.current_x === x && item.current_y === y;
        }).length) {
            return false;
        }
        for (let i = 0; i < this.allowed_tiles.length; ++i) {
            const tile = this.allowed_tiles[i];
            if (tile.x === x && tile.y === y && tile.collision_layer === this.data.map.collision_layer) return true;
        }
        return false;
    }

    get_current_position(map) {
        const x = (this.sprite.x/map.sprite.tileWidth) | 0;
        const y = (this.sprite.y/map.sprite.tileHeight) | 0;
        return { x: x, y: y };
    }

    change_collider_layer(data, destination_collider_layer) {
        this.sprite.body.removeCollisionGroup(data.collision.interactable_objs_collision_groups[this.base_collision_layer]);
        this.sprite.body.setCollisionGroup(data.collision.interactable_objs_collision_groups[destination_collider_layer]);
        this.base_collision_layer = destination_collider_layer;
        this.sprite.base_collision_layer = destination_collider_layer;
        this.collision_change_functions.forEach(f => { f(); });
    }

    insert_event(id) {
        this.events.add(id);
    }

    get_events() {
        return [...this.events].map(id => TileEvent.get_event(id));
    }

    remove_event(id) {
        this.events.delete(id);
    }

    creating_blocking_stair_block(collision_obj) {
        const target_layer = this.base_collision_layer + this.custom_data.block_stair_collider_layer_shift;
        const x_pos = (this.current_x + .5) * this.data.map.sprite.tileWidth;
        const y_pos = (this.current_y + 1.5) * this.data.map.sprite.tileHeight - 4;
        let body = this.game.physics.p2.createBody(x_pos, y_pos, 0, true);
        body.clearShapes();
        const width = this.data.dbs.interactable_objects_db[this.key_name].body_radius * 2;
        body.setRectangle(width, width, 0, 0);
        if (!(target_layer in this.data.collision.interactable_objs_collision_groups)) {
            this.data.collision.interactable_objs_collision_groups[target_layer] = this.game.physics.p2.createCollisionGroup();
        }
        body.setCollisionGroup(this.data.collision.interactable_objs_collision_groups[target_layer]);
        body.damping = numbers.MAP_DAMPING;
        body.angularDamping = numbers.MAP_DAMPING;
        body.setZeroRotation();
        body.fixedRotation = true;
        body.dynamic = false;
        body.static = true;
        body.debug = this.data.hero.sprite.body.debug;
        body.collides(collision_obj.hero_collision_group);
        this.custom_data.blocking_stair_block = body;
    }

    initial_config(map_sprite) {
        const interactable_object_sprite = this.data.npc_group.create(0, 0, this.key_name + "_" + this.key_name);
        this.set_sprite(interactable_object_sprite);
        this.sprite.is_interactable_object = true;
        this.sprite.roundPx = true;
        this.sprite.base_collision_layer = this.base_collision_layer;
        this.sprite.interactable_object = this;
        if (this.data.dbs.interactable_objects_db[this.key_name].send_to_back !== undefined) { 
            this.sprite.send_to_back = this.data.dbs.interactable_objects_db[this.key_name].send_to_back;
        }
        if (this.data.dbs.interactable_objects_db[this.key_name].anchor_x !== undefined) {
            this.sprite.anchor.x = this.data.dbs.interactable_objects_db[this.key_name].anchor_x;
        }
        this.sprite.anchor.y = this.data.dbs.interactable_objects_db[this.key_name].anchor_y;
        const shift_x = this.data.dbs.interactable_objects_db[this.key_name].shift_x !== undefined ? this.data.dbs.interactable_objects_db[this.key_name].shift_x : 0;
        const shift_y = this.data.dbs.interactable_objects_db[this.key_name].shift_y !== undefined ? this.data.dbs.interactable_objects_db[this.key_name].shift_y : 0;
        this.sprite.centerX = (this.x + 1) * map_sprite.tileWidth + shift_x;
        const anchor_shift = this.data.dbs.interactable_objects_db[this.key_name].anchor_y * map_sprite.tileWidth * 0.5;
        this.sprite.centerY = this.y * map_sprite.tileWidth - anchor_shift + shift_y;
        this.sprite_info.setAnimation(this.sprite, this.key_name);
        const initial_animation = this.data.dbs.interactable_objects_db[this.key_name].initial_animation;
        this.sprite.animations.play(this.key_name + "_" + initial_animation);
    }

    initialize_related_events(map_events, map) {
        const position = this.get_current_position(map);
        let x_pos = position.x;
        let y_pos = position.y;
        for (let i = 0; i < this.data.dbs.interactable_objects_db[this.key_name].events.length; ++i) {
            const event_info = this.data.dbs.interactable_objects_db[this.key_name].events[i];
            x_pos += event_info.x_shift !== undefined ? event_info.x_shift : 0;
            y_pos += event_info.y_shift !== undefined ? event_info.y_shift : 0;
            let collider_layer_shift = event_info.collider_layer_shift !== undefined ? event_info.collider_layer_shift : 0;
            collider_layer_shift = this.collider_layer_shift !== undefined ? this.collider_layer_shift : collider_layer_shift;
            this.collider_layer_shift = collider_layer_shift;
            const active_event = event_info.active !== undefined ? event_info.active : true;
            const target_layer = this.base_collision_layer + collider_layer_shift;
            switch (event_info.type) {
                case interactable_object_event_types.JUMP:
                    this.set_jump_type_event(event_info, x_pos, y_pos, active_event, target_layer, map_events);
                    break;
                case interactable_object_event_types.JUMP_AROUND:
                    this.set_jump_around_event(event_info, x_pos, y_pos, active_event, target_layer, map_events);
                    break;
                case interactable_object_event_types.CLIMB:
                    this.set_stair_event(event_info, x_pos, y_pos, active_event, target_layer, map_events);
                    break
            }
        }
    }

    not_allowed_tile_test(x, y) {
        for (let i = 0; i < this.not_allowed_tiles.length; ++i) {
            const not_allowed_tile = this.not_allowed_tiles[i];
            if (not_allowed_tile.x === x && not_allowed_tile.y === y) {
                return true;
            }
        }
        return false;
    }

    set_jump_type_event(event_info, x_pos, y_pos, active_event, target_layer, map_events) {
        if (this.not_allowed_tile_test(x_pos, y_pos)) return;
        const this_event_location_key = TileEvent.get_location_key(x_pos, y_pos);
        if (!(this_event_location_key in map_events)) {
            map_events[this_event_location_key] = [];
        }
        const new_event = new JumpEvent(
            this.game,
            this.data,
            x_pos,
            y_pos,
            [directions.up, directions.down, directions.right, directions.left],
            [target_layer],
            event_info.dynamic,
            active_event,
            event_info.is_set === undefined ? true: event_info.is_set
        );
        map_events[this_event_location_key].push(new_event);
        this.insert_event(new_event.id);
        this.events_info[event_info.type] = event_info;
        this.collision_change_functions.push(() => {
            new_event.activation_collision_layers = [this.base_collision_layer + this.collider_layer_shift];
        });
    }

    set_jump_around_event(event_info, x_pos, y_pos, active_event, target_layer, map_events) {
        let is_set = event_info.is_set === undefined ? true: event_info.is_set;
        get_surroundings(x_pos, y_pos).forEach((pos, index) => {
            if (this.not_allowed_tile_test(pos.x, pos.y)) return;
            const this_event_location_key = TileEvent.get_location_key(pos.x, pos.y);
            if (this_event_location_key in map_events) {
                //check if already theres a jump event in this place
                for (let k = 0; k < map_events[this_event_location_key].length; ++k) {
                    const event = map_events[this_event_location_key][k];
                    if (event.type === tile_event_types.JUMP && event.is_set) {
                        if (event.activation_collision_layers.includes(target_layer)) {
                            is_set = false;
                        }
                    }
                }
            } else {
                map_events[this_event_location_key] = [];
            }
            const new_event = new JumpEvent(
                this.game,
                this.data,
                pos.x,
                pos.y,
                [directions.right, directions.left, directions.down, directions.up][index],
                [this.base_collision_layer],
                event_info.dynamic,
                active_event,
                is_set
            );
            map_events[this_event_location_key].push(new_event);
            this.insert_event(new_event.id);
            this.collision_change_functions.push(() => {
                new_event.activation_collision_layers = [this.base_collision_layer];
            });
        });
        this.events_info[event_info.type] = event_info;
    }

    set_stair_event(event_info, x_pos, y_pos, active_event, target_layer, map_events) {
        const events_data = [{
            x: x_pos,
            y: y_pos + 1,
            activation_directions: [directions.up],
            activation_collision_layers: [this.base_collision_layer],
            change_to_collision_layer: this.base_collision_layer + this.intermediate_collider_layer_shift,
            climbing_only: false,
            collision_change_function: (event) => {
                event.activation_collision_layers = [this.base_collision_layer];
                event.change_to_collision_layer = this.base_collision_layer + this.intermediate_collider_layer_shift;
            }
        },{
            x: x_pos,
            y: y_pos,
            activation_directions: [directions.down],
            activation_collision_layers: [this.base_collision_layer + this.intermediate_collider_layer_shift],
            change_to_collision_layer: this.base_collision_layer,
            climbing_only: true,
            collision_change_function: (event) => {
                event.activation_collision_layers = [this.base_collision_layer + this.intermediate_collider_layer_shift];
                event.change_to_collision_layer = this.base_collision_layer;
            }
        },{
            x: x_pos,
            y: y_pos + event_info.last_y_shift + 1,
            activation_directions: [directions.up],
            activation_collision_layers: [this.base_collision_layer + this.intermediate_collider_layer_shift],
            change_to_collision_layer: target_layer,
            climbing_only: true,
            collision_change_function: (event) => {
                event.activation_collision_layers = [this.base_collision_layer + this.intermediate_collider_layer_shift];
                event.change_to_collision_layer = this.base_collision_layer + this.collider_layer_shift;
            }
        },{
            x: x_pos,
            y: y_pos + event_info.last_y_shift,
            activation_directions: [directions.down],
            activation_collision_layers: [target_layer],
            change_to_collision_layer: this.base_collision_layer + this.intermediate_collider_layer_shift,
            climbing_only: false,
            collision_change_function: (event) => {
                event.activation_collision_layers = [this.base_collision_layer + this.collider_layer_shift];
                event.change_to_collision_layer = this.base_collision_layer + this.intermediate_collider_layer_shift;
            }
        }];
        events_data.forEach(event_data => {
            const this_location_key = TileEvent.get_location_key(event_data.x, event_data.y);
            if (!(this_location_key in map_events)) {
                map_events[this_location_key] = [];
            }
            const new_event = new ClimbEvent(
                this.game,
                this.data,
                event_data.x,
                event_data.y,
                event_data.activation_directions,
                event_data.activation_collision_layers,
                event_info.dynamic,
                active_event,
                event_data.change_to_collision_layer,
                event_info.is_set,
                this,
                event_data.climbing_only
            );
            map_events[this_location_key].push(new_event);
            this.insert_event(new_event.id);
            this.collision_change_functions.push(event_data.collision_change_function.bind(null, new_event));
        });
        this.events_info[event_info.type] = event_info;
    }

    config_body(collision_obj) {
        if (this.data.dbs.interactable_objects_db[this.key_name].body_radius === 0) return;
        const collision_groups = collision_obj.interactable_objs_collision_groups;
        this.game.physics.p2.enable(this.sprite, false);
        this.sprite.anchor.y = this.data.dbs.interactable_objects_db[this.key_name].anchor_y; //Important to be after the previous command
        this.sprite.body.clearShapes();
        const width = this.data.dbs.interactable_objects_db[this.key_name].body_radius << 1;
        const polygon = mount_collision_polygon(width, -(width >> 1), this.data.dbs.interactable_objects_db[this.key_name].collision_body_bevel);
        this.sprite.body.addPolygon({
                optimalDecomp: false,
                skipSimpleCheck: true,
                removeCollinearPoints: false
        }, polygon);
        this.sprite.body.setCollisionGroup(collision_groups[this.base_collision_layer]);
        this.sprite.body.damping = 1;
        this.sprite.body.angularDamping = 1;
        this.sprite.body.setZeroRotation();
        this.sprite.body.fixedRotation = true;
        this.sprite.body.dynamic = false;
        this.sprite.body.static = true;
        if (this.custom_data.block_stair_collider_layer_shift !== undefined) {
            this.creating_blocking_stair_block(collision_obj);
        }
    }
}