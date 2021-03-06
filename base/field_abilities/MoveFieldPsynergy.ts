import * as numbers from '../magic_numbers';
import { target_only_push } from '../interactable_objects/push';
import { directions, reverse_directions, join_directions } from "../utils";
import { FieldAbilities } from "./FieldAbilities";
import { SpriteBase } from '../SpriteBase';

const ABILITY_KEY_NAME = "move";
const ACTION_KEY_NAME = "cast";
const MAX_HAND_TRANSLATE = 16;
const MOVE_MAX_RANGE = 26;
const MOVE_HAND_KEY_NAME = "move_hand";

export class MoveFieldPsynergy extends FieldAbilities {
    public hand_sprite_base: SpriteBase;
    public hand_sprite: Phaser.Sprite;
    public emitter: Phaser.Particles.Arcade.Emitter;
    public final_emitter: Phaser.Particles.Arcade.Emitter;
    public controls_active: boolean;
    public target_hueshift_timer: Phaser.Timer;
    public final_emitter_particles_count: number;

    constructor(game, data) {
        super(game, data, ABILITY_KEY_NAME, MOVE_MAX_RANGE, ACTION_KEY_NAME, true);
        this.set_bootstrap_method(this.init_move.bind(this));
        this.set_cast_finisher_method(this.unset_hue_shifter.bind(this));
        this.hand_sprite_base = this.data.info.misc_sprite_base_list[MOVE_HAND_KEY_NAME];
        const sprite_key = this.hand_sprite_base.getActionKey(MOVE_HAND_KEY_NAME);
        this.hand_sprite = this.game.add.sprite(0, 0, sprite_key);
        this.hand_sprite.visible = false;
        this.hand_sprite_base.setAnimation(this.hand_sprite, MOVE_HAND_KEY_NAME);
        this.emitter = null;
        this.final_emitter = null;
        this.set_controls();
        this.controls_active = false;
    }

    set_controls() {
        this.game.input.keyboard.addKey(Phaser.Keyboard.RIGHT).onDown.add(() => {
            if (!this.controls_active) return;
            this.controllable_char.trying_to_push_direction = directions.right;
            this.fire_push();
        });
        this.game.input.keyboard.addKey(Phaser.Keyboard.LEFT).onDown.add(() => {
            if (!this.controls_active) return;
            this.controllable_char.trying_to_push_direction = directions.left;
            this.fire_push();
        });
        this.game.input.keyboard.addKey(Phaser.Keyboard.UP).onDown.add(() => {
            if (!this.controls_active) return;
            this.controllable_char.trying_to_push_direction = directions.up;
            this.fire_push();
        });
        this.game.input.keyboard.addKey(Phaser.Keyboard.DOWN).onDown.add(() => {
            if (!this.controls_active) return;
            this.controllable_char.trying_to_push_direction = directions.down;
            this.fire_push();
        });
        this.data.esc_input.add(() => {
            if (!this.controls_active) return;
            this.controls_active = false;
            this.finish_hand();
            this.unset_hero_cast_anim();
        });
    }

    fire_push() {
        if (this.data.map.collision_layer === this.target_object.base_collision_layer) {
            let item_position = this.target_object.get_current_position(this.data.map);
            switch (this.controllable_char.trying_to_push_direction) {
                case directions.up:
                    item_position.y -= 1;
                    break;
                case directions.down:
                    item_position.y += 1;
                    break;
                case directions.left:
                    item_position.x -= 1;
                    break;
                case directions.right:
                    item_position.x += 1;
                    break;
            }
            let position_allowed = this.target_object.position_allowed(item_position.x, item_position.y);
            if (position_allowed && !(this.controllable_char.tile_x_pos === item_position.x && this.controllable_char.tile_y_pos === item_position.y)) {
                this.controls_active = false;
                target_only_push(this.game, this.data, this.target_object, (x_shift, y_shift) => {
                    const x_target = this.hand_sprite.x + x_shift;
                    const y_target = this.hand_sprite.y + y_shift;
                    this.game.add.tween(this.hand_sprite).to(
                        {x: x_target, y: y_target},
                        numbers.PUSH_TIME,
                        Phaser.Easing.Linear.None,
                        true
                    );
                    this.game.time.events.add(numbers.PUSH_TIME >> 1, () => {
                        let need_change = false;
                        if ([directions.up, directions.down].includes(this.cast_direction) && [directions.left, directions.right].includes(this.controllable_char.trying_to_push_direction)) {
                            this.cast_direction = join_directions(this.cast_direction, this.controllable_char.trying_to_push_direction);
                            need_change = true;
                        } else if ([directions.up, directions.down].includes(this.controllable_char.trying_to_push_direction) && [directions.left, directions.right].includes(this.cast_direction)) {
                            this.cast_direction = join_directions(this.controllable_char.trying_to_push_direction, this.cast_direction);
                            need_change = true;
                        }
                        if (!need_change) return;
                        this.controllable_char.set_direction(this.cast_direction);
                        this.controllable_char.sprite.animations.stop();
                        const dest_direction = reverse_directions[this.cast_direction];
                        this.controllable_char.sprite.animations.play("cast_" + dest_direction, 0);
                        this.controllable_char.sprite.animations.frameName = `cast/${dest_direction}/01`;
                    });
                }, () => {
                    const pos_sqr_distance = Math.pow(this.controllable_char.sprite.body.x - this.target_object.sprite.body.x, 2) + Math.pow(this.controllable_char.sprite.body.y - this.target_object.sprite.body.y, 2);
                    const rad_sqr_distance = Math.pow(numbers.HERO_BODY_RADIUS + this.data.dbs.interactable_objects_db[this.target_object.key_name].body_radius, 2);
                    if (pos_sqr_distance <= rad_sqr_distance) {
                        this.controllable_char.sprite.body.x = (this.controllable_char.tile_x_pos + 0.5) * this.data.map.sprite.tileWidth;
                        this.controllable_char.sprite.body.y = (this.controllable_char.tile_y_pos + 0.5) * this.data.map.sprite.tileHeight;
                        this.controllable_char.shadow.x = this.controllable_char.sprite.body.x;
                        this.controllable_char.shadow.y = this.controllable_char.sprite.body.y;
                    }
                    this.controllable_char.sprite.body.velocity.x = this.controllable_char.sprite.body.velocity.y = 0;
                    this.finish_hand();
                    this.unset_hero_cast_anim();
                }, false, () => {
                    this.data.map.sort_sprites();
                });
            }
        }
    }

    set_hand() {
        this.data.overlayer_group.add(this.hand_sprite);
        this.data.overlayer_group.bringToTop(this.hand_sprite);
        this.hand_sprite.visible = true;
        this.hand_sprite.scale.setTo(1, 1);
        this.hand_sprite.send_to_front = true;
        this.hand_sprite.base_collision_layer = this.data.map.collision_layer;
        this.hand_sprite.animations.currentAnim.stop(true);
        this.hand_sprite.frameName = this.hand_sprite_base.getFrameName(MOVE_HAND_KEY_NAME, reverse_directions[this.cast_direction], 0);
        this.hand_sprite.anchor.x = 0.5;
        this.hand_sprite.centerX = this.controllable_char.sprite.centerX;
        this.hand_sprite.centerY = this.controllable_char.sprite.centerY;
    }

    translate_hand() {
        let translate_x = this.hand_sprite.centerX;
        let translate_y = this.hand_sprite.centerY;
        switch (this.cast_direction) {
            case directions.up:
                if (this.target_found) {
                    translate_x = this.target_object.sprite.centerX;
                    translate_y = this.target_object.sprite.y;
                } else {
                    translate_y -= MAX_HAND_TRANSLATE;
                }
                break;
            case directions.down:
                if (this.target_found) {
                    translate_x = this.target_object.sprite.centerX;
                    translate_y = this.target_object.sprite.y - this.target_object.sprite.height + this.data.dbs.interactable_objects_db[this.target_object.key_name].body_radius;
                } else {
                    translate_y += MAX_HAND_TRANSLATE;
                }
                break;
            case directions.right:
                if (this.target_found) {
                    translate_x = this.target_object.sprite.x - 2 * this.data.dbs.interactable_objects_db[this.target_object.key_name].body_radius;
                    translate_y = this.target_object.sprite.centerY;
                } else {
                    translate_x += MAX_HAND_TRANSLATE;
                }
                break;
            case directions.left:
                if (this.target_found) {
                    translate_x = this.target_object.sprite.x + 2 * this.data.dbs.interactable_objects_db[this.target_object.key_name].body_radius;
                    translate_y = this.target_object.sprite.centerY;
                } else {
                    translate_x -= MAX_HAND_TRANSLATE;
                }
                break;
        }
        this.game.add.tween(this.hand_sprite).to(
            {centerX: translate_x, centerY: translate_y},
            200,
            Phaser.Easing.Linear.None,
            true
        ).onComplete.addOnce(() => {
            const anim_key = this.hand_sprite_base.getAnimationKey(MOVE_HAND_KEY_NAME, reverse_directions[this.cast_direction]);
            this.hand_sprite.animations.play(anim_key);
            if (this.target_found) {
                this.target_object.sprite.filters = [this.target_object.color_filter];
                this.target_hueshift_timer = this.game.time.create(false);
                this.target_hueshift_timer.loop(5, () => {
                    this.target_object.color_filter.hue_adjust = Math.random() * 2 * Math.PI;
                });
                this.target_hueshift_timer.start();
                this.controls_active = true;
            } else {
                this.game.time.events.add(700, () => {
                    this.finish_hand();
                    this.unset_hero_cast_anim();
                });
            }
        });
    }

    finish_hand() {
        let flip_timer = this.game.time.create(false);
        let fake_hand_scale = {x : 1};
        flip_timer.loop(40, () => {
            this.hand_sprite.scale.x = this.hand_sprite.scale.x > 0 ? -fake_hand_scale.x : fake_hand_scale.x;
        });
        flip_timer.start();
        let y_shift = this.hand_sprite.y - 10;
        this.game.add.tween(this.hand_sprite).to(
            { y: y_shift },
            350,
            Phaser.Easing.Linear.None,
            true
        );
        this.game.add.tween(fake_hand_scale).to(
            { x: 0 },
            350,
            Phaser.Easing.Linear.None,
            true
        );
        this.game.add.tween(this.hand_sprite.scale).to(
            { y: 0 },
            350,
            Phaser.Easing.Linear.None,
            true
        ).onComplete.addOnce(() => {
            this.start_final_emitter(this.hand_sprite.x, this.hand_sprite.y);
            this.stop_casting();
            flip_timer.stop();
            this.data.overlayer_group.remove(this.hand_sprite, false);
            this.unset_emitter();
        });
        
    }

    set_emitter() {
        let x_shift = 0;
        let y_shift = 0;
        switch(this.cast_direction) {
            case directions.up:
                y_shift = -MAX_HAND_TRANSLATE;
                break;
            case directions.down:
                y_shift = MAX_HAND_TRANSLATE;
                break;
            case directions.left:
                x_shift = -MAX_HAND_TRANSLATE;
                break;
            case directions.right:
                x_shift = MAX_HAND_TRANSLATE;
                break;
        }
        this.emitter = this.game.add.emitter(this.controllable_char.sprite.centerX + x_shift, this.controllable_char.sprite.centerY + y_shift, 150);
        this.emitter.makeParticles("psynergy_particle");
        this.emitter.minParticleSpeed.setTo(-15, -15);
        this.emitter.maxParticleSpeed.setTo(15, 15);
        this.emitter.gravity = 0;
        this.emitter.width = 2 * MOVE_MAX_RANGE;
        this.emitter.height = 2 * MOVE_MAX_RANGE;
        this.emitter.forEach(particle => {
            particle.animations.add('vanish', null, 4, true, false);
        });
    }

    start_emitter() {
        this.emitter.start(false, Phaser.Timer.QUARTER, 15, 0);
        this.emitter.forEach(particle => {
            particle.animations.play('vanish');
            particle.animations.currentAnim.setFrame((Math.random() * particle.animations.frameTotal) | 0);
        });
    }

    unset_emitter() {
        this.emitter.destroy();
    }

    set_final_emitter() {
        this.final_emitter_particles_count = 8;
        this.final_emitter = this.game.add.emitter(0, 0, this.final_emitter_particles_count);
        this.final_emitter.makeParticles("psynergy_particle");
        this.final_emitter.gravity = 300;
        this.final_emitter.forEach(particle => {
            particle.animations.add('vanish', null, 4, true, false);
        });
    }

    start_final_emitter(x, y) {
        this.final_emitter.x = x;
        this.final_emitter.y = y;
        let lifetime = Phaser.Timer.QUARTER;
        this.final_emitter.start(true, lifetime, null, this.final_emitter_particles_count);
        this.final_emitter.forEach(particle => {
            particle.animations.play('vanish');
            particle.animations.currentAnim.setFrame((Math.random() * particle.animations.frameTotal) | 0);
        });
        this.game.time.events.add(lifetime, () => {
            this.unset_final_emitter();
        });
    }

    unset_final_emitter() {
        this.final_emitter.destroy();
    }

    unset_hue_shifter() {
        if (this.target_found) {
            this.target_object.sprite.filters = undefined;
            this.target_hueshift_timer.stop();
        }
    }

    init_move() {
        this.set_emitter();
        this.set_final_emitter();
        this.search_for_target();
        this.set_hand();
        this.field_psynergy_window.close();
        this.translate_hand();
        this.start_emitter();
    }
}